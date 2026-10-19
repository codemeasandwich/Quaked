// Native Hexen II fast entity updates: the high-bit command, U_* bit bytes (one to three), entity number, and the
// native field order with 1/8-unit coordinates and 1/256-turn angles. Round-trips a full update, a minimal one, a
// long entity and concatenated updates; refuses non-updates, truncation and trailing bytes.
import { Hexen2_WriteEntityUpdate, Hexen2_ReadEntityUpdate, U } from '../src/engine/common/hexen2_entitywire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m, tol = 0.002 ) => check( Math.abs( a - b ) < tol, `${m}: ${a} != ${b}` );

Deno.test( 'native fast entity updates round-trip and concatenate', () => {

	const full = Hexen2_WriteEntityUpdate( { entity: 300, longEntity: true, noLerp: true, modelIndex: 42, frame: 7,
		colormap: 3, skin: 2, drawflags: 9, effects: 4, scale: 16, abslight: 8,
		origin: [ 10.125, - 4.5, 64 ], angles: [ 45, 90, 180 ] } );
	check( full.ok, full.reason );
	check( ( full.bytes[ 0 ] & 0x80 ) !== 0, 'the fast-update high bit' );
	const decoded = Hexen2_ReadEntityUpdate( full.bytes );
	check( decoded.ok, decoded.reason );
	const u = decoded.update;
	same( u.entity, 300, 'the long entity number' );
	same( u.modelIndex, 42, 'model index' );
	same( u.frame, 7, 'frame' );
	same( u.colormap, 3, 'colormap' );
	same( u.skin, 2, 'skin' );
	same( u.drawflags, 9, 'draw flags' );
	same( u.effects, 4, 'effects' );
	same( u.scale, 16, 'scale' );
	same( u.abslight, 8, 'absolute light' );
	near( u.origin[ 0 ], 10.125, 'origin x at 1/8 unit' );
	near( u.origin[ 1 ], - 4.5, 'negative origin y' );
	near( u.origin[ 2 ], 64, 'origin z' );
	near( u.angles[ 0 ], 45, 'angle x at 1/256 turn' );
	near( u.angles[ 1 ], 90, 'angle y' );
	near( u.angles[ 2 ], 180, 'angle z' );
	same( u.noLerp, true, 'the no-lerp bit' );

	// a minimal update sends only one origin axis and no model/frame
	const minimal = Hexen2_ReadEntityUpdate( Hexen2_WriteEntityUpdate( { entity: 4, origin: [ 1, 0, 0 ] } ).bytes );
	check( minimal.ok, minimal.reason );
	same( minimal.update.entity, 4, 'the short entity number' );
	same( minimal.update.modelIndex, undefined, 'no model sent' );
	near( minimal.update.origin[ 0 ], 1, 'the sent origin axis' );
	same( minimal.update.origin[ 1 ], 0, 'an omitted origin axis is zero' );

	// concatenated updates parse one after another
	const a = Hexen2_WriteEntityUpdate( { entity: 1, origin: [ 1, 2, 3 ] } ).bytes;
	const b = Hexen2_WriteEntityUpdate( { entity: 2, angles: [ 0, 90, 0 ] } ).bytes;
	const joined = Uint8Array.from( [ ...a, ...b ] );
	const first = Hexen2_ReadEntityUpdate( joined, { allowTrailing: true } );
	check( first.ok, first.reason );
	const second = Hexen2_ReadEntityUpdate( joined.subarray( first.consumed ), { allowTrailing: true } );
	check( second.ok, second.reason );
	same( second.update.entity, 2, 'the second concatenated entity' );
	near( second.update.angles[ 1 ], 90, 'the second update angle' );

	// refusals
	check( Hexen2_ReadEntityUpdate( Uint8Array.from( [ 0x01, 0 ] ) ).ok === false, 'a non-update command byte' );
	check( Hexen2_ReadEntityUpdate( full.bytes.subarray( 0, full.bytes.length - 1 ) ).ok === false, 'truncated update' );
	check( Hexen2_ReadEntityUpdate( Uint8Array.from( [ ...minimal_bytes(), 0 ] ) ).ok === false, 'trailing update bytes' );
	check( Hexen2_WriteEntityUpdate( { entity: 300, origin: [ 0, 0, 0 ] } ).ok === false, 'entity 300 without longEntity' );
	same( U.ORIGIN1, 2, 'the native origin bit' );

} );

function minimal_bytes() { return Hexen2_WriteEntityUpdate( { entity: 4, origin: [ 1, 0, 0 ] } ).bytes; }
