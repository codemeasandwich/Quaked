// Turned item boxes (src/newer/render/r_itemturn.js; card T-3faa98e3 item 13, docs/small-touches-2026-10-14.md):
// in Newer Game each pickup box the map placed unturned is drawn turned by its own amount (up to 30 degrees) about
// its middle, never with a corner in a wall; the same box gets the same turn every time; New Game, the switch off,
// a mapper's own angle and the exploding box are left alone. Through the public R_ItemTurn with the shareware pack's
// real box models and e1m1's real walls.
import { readFileSync } from 'node:fs';
import { COM_LoadPackFile, COM_AddPack } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { cl, cls } from '../src/engine/client/client.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_Set } from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { R_ItemTurn, r_itemturn } from '../src/newer/render/r_itemturn.js';
import { FX_Contents, FX_SOLID } from '../src/newer/render/fx_world.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
Mod_Init();
for ( const v of [ r_hdr, r_itemturn ] ) if ( ! Cvar_FindVar( v.name ) ) Cvar_RegisterVariable( v );
const e1m1 = Mod_ForName( 'maps/e1m1.bsp', true ), health = Mod_ForName( 'maps/b_bh25.bsp', true ), shells = Mod_ForName( 'maps/b_shell0.bsp', true ), barrel = Mod_ForName( 'maps/b_explob.bsp', true );
// e1m1's own item boxes, from its entities
const placed = [ ...e1m1.entities.matchAll( /\{[^}]*"classname" "(item_health|item_shells|item_spikes|item_rockets|item_cells)"[^}]*\}/g ) ]
	.map( m => /"origin" "([^"]+)"/.exec( m[ 0 ] )[ 1 ].split( ' ' ).map( Number ) );
function reset( newer = '1', on = '1' ) { cl.worldmodel = e1m1; Cvar_Set( 'r_hdr', newer ); Cvar_Set( 'r_itemturn', on ); R_AnimSetClassicPass( false ); }
// a client entity as the client leaves it each frame before the turn: the server's place and angles
const box = ( model, origin, angles = [ 0, 0, 0 ] ) => ( { model, origin: Float32Array.from( origin ), angles: Float32Array.from( angles ) } );
// the box's middle, drawn: the renderer turns the model by its yaw about its origin
function middle( e ) { const m = e.model, cx = ( m.mins[ 0 ] + m.maxs[ 0 ] ) / 2, cy = ( m.mins[ 1 ] + m.maxs[ 1 ] ) / 2, r = e.angles[ 1 ] * Math.PI / 180; return [ e.origin[ 0 ] + cx * Math.cos( r ) - cy * Math.sin( r ), e.origin[ 1 ] + cx * Math.sin( r ) + cy * Math.cos( r ) ]; }

Deno.test( 'e1m1\'s boxes are turned by their own amounts, about their middles, with no corner in a wall', () => {

	reset();
	check( placed.length >= 5, 'e1m1 places item boxes: ' + placed.length );
	const turns = [];
	for ( const o of placed ) {

		const e = box( health, o ), before = middle( e );
		R_ItemTurn( e );
		const yaw = e.angles[ 1 ]; turns.push( yaw );
		check( Math.abs( yaw ) <= 30, 'at most 30 degrees: ' + yaw );
		const after = middle( e );
		check( Math.hypot( after[ 0 ] - before[ 0 ], after[ 1 ] - before[ 1 ] ) < 1e-3, 'it turns about its middle, which stays put' );
		const r = yaw * Math.PI / 180, m = e.model;
		for ( const [ x, y ] of [ [ m.mins[ 0 ], m.mins[ 1 ] ], [ m.maxs[ 0 ], m.mins[ 1 ] ], [ m.maxs[ 0 ], m.maxs[ 1 ] ], [ m.mins[ 0 ], m.maxs[ 1 ] ] ] )
			check( FX_Contents( e1m1, [ e.origin[ 0 ] + x * Math.cos( r ) - y * Math.sin( r ), e.origin[ 1 ] + x * Math.sin( r ) + y * Math.cos( r ), o[ 2 ] + 8 ] ) !== FX_SOLID, 'no corner in a wall at ' + o );

	}
	check( new Set( turns.map( t => t.toFixed( 3 ) ) ).size >= Math.min( 4, turns.length - 1 ), 'different boxes, different turns: ' + turns.map( t => t.toFixed( 1 ) ) );
	const again = box( health, placed[ 0 ] ); R_ItemTurn( again ); same( again.angles[ 1 ], turns[ 0 ], 'the same box, the same turn' );

} );

Deno.test( 'each frame starts from the server\'s place: the turn never adds up, and a box riding a lift keeps its turn', () => {

	reset();
	const o = placed[ 0 ], e = box( health, o );
	R_ItemTurn( e ); const first = [ ...e.origin, e.angles[ 1 ] ], yaw = e.angles[ 1 ];
	for ( let i = 0; i < 5; i ++ ) { e.origin.set( o ); e.angles.fill( 0 ); R_ItemTurn( e ); }
	same( [ ...e.origin, e.angles[ 1 ] ].join(), first.join(), 'five more frames: the same' );
	for ( let z = 1; z <= 40; z ++ ) { e.origin.set( [ o[ 0 ], o[ 1 ], o[ 2 ] + z ] ); e.angles.fill( 0 ); R_ItemTurn( e ); same( e.angles[ 1 ], yaw, 'rising ' + z + ' units: the same turn' ); }

} );

Deno.test( 'both of the client\'s entity paths turn the box after setting its place and angles', () => {

	const main = readFileSync( new URL( '../src/engine/client/cl_main.js', import.meta.url ), 'utf8' );
	same( ( main.match( /\n\t\tR_ItemTurn\( ent \);/g ) ?? [] ).length, 2, 'CL_LinkPacketEntities and CL_RelinkEntities' );
	check( /ent\.origin\[ i \] = ent\.msg_origins\[ 1 \]\[ i \] \+ f \* _peDelta\[ i \];[\s\S]{0,40}\}\s*\}\s*R_ItemTurn\( ent \);/.test( main ), 'the packet path: after the place is lerped' );
	check( /ent\.angles\[ 1 \] = bobjrotate;\s*R_ItemTurn\( ent \);/.test( main ), 'the relink path: after the angles, the spin included' );

} );

Deno.test( 'New Game, the classic half, the switch off, a mapper\'s own angle, the exploding box and anything else stay as they were', () => {

	const o = placed[ 0 ];
	const untouched = ( e, name ) => { const before = [ ...e.origin, ...e.angles ].join(); R_ItemTurn( e ); same( [ ...e.origin, ...e.angles ].join(), before, name ); };
	reset( '0' ); untouched( box( health, o ), 'New Game' );
	reset(); R_AnimSetClassicPass( true ); untouched( box( health, o ), 'the classic half of the title demo' ); R_AnimSetClassicPass( false );
	reset( '1', '0' ); untouched( box( health, o ), 'r_itemturn 0' );
	reset(); cls.demoplayback = true; untouched( box( health, o ), 'a demo (the title demo\'s halves among them)' ); cls.demoplayback = false;
	reset(); untouched( box( health, o, [ 0, 90, 0 ] ), 'a box the mapper turned' );
	untouched( box( barrel, o ), 'the exploding box' );
	untouched( box( Mod_ForName( 'progs/armor.mdl', true ), o ), 'an alias model' );
	const s = box( shells, o ); R_ItemTurn( s ); check( s.angles[ 1 ] !== 0 || s._itemTurn.yaw === 0, 'shells are a pickup box too' );

} );

Deno.test( 'a box flush in a corner turns less, or not at all, rather than into the walls', () => {

	reset();
	// a point in e1m1 where a box set against solid on two sides: search for an open spot with solid 1 unit beyond -x and -y
	let spot = null;
	for ( const o of placed ) for ( const [ dx, dy ] of [ [ 0, 0 ] ] ) { const p = [ o[ 0 ] + dx, o[ 1 ] + dy, o[ 2 ] + 8 ]; if ( FX_Contents( e1m1, p ) !== FX_SOLID ) spot = spot ?? o; }
	check( spot, 'an open spot' );
	// slide the box toward -x until its corner touches solid, then one unit back: flush against a wall
	const p = [ spot[ 0 ], spot[ 1 ], spot[ 2 ] ];
	while ( FX_Contents( e1m1, [ p[ 0 ] - 1, p[ 1 ] + 16, p[ 2 ] + 8 ] ) !== FX_SOLID && p[ 0 ] > spot[ 0 ] - 512 ) p[ 0 ] -= 1;
	const e = box( health, p ); R_ItemTurn( e );
	const r = e.angles[ 1 ] * Math.PI / 180, m = e.model;
	for ( const [ x, y ] of [ [ m.mins[ 0 ], m.mins[ 1 ] ], [ m.maxs[ 0 ], m.mins[ 1 ] ], [ m.maxs[ 0 ], m.maxs[ 1 ] ], [ m.mins[ 0 ], m.maxs[ 1 ] ] ] )
		check( FX_Contents( e1m1, [ e.origin[ 0 ] + x * Math.cos( r ) - y * Math.sin( r ), e.origin[ 1 ] + x * Math.sin( r ) + y * Math.cos( r ), p[ 2 ] + 8 ] ) !== FX_SOLID, 'flush against a wall, no corner goes into it (turn ' + e.angles[ 1 ] + ')' );

} );
