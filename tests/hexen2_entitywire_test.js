// Native Hexen II fast entity updates: the high-bit command, U_* bit bytes (one to three), entity number, and the
// native field order with 1/8-unit coordinates and 1/256-turn angles. Round-trips a full update, a minimal one, a
// long entity and concatenated updates; refuses non-updates, truncation and trailing bytes.
import { Hexen2_WriteEntityUpdate, Hexen2_ReadEntityUpdate, Hexen2_WriteBaseline, Hexen2_ReadBaseline, Hexen2_WriteSpawnStatic, Hexen2_WriteReference, Hexen2_ReadReference, Hexen2_WriteClearEdicts, Hexen2_ReadClearEdicts, U } from '../src/engine/common/hexen2_entitywire.js';

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

Deno.test( 'signon baselines and static entities round-trip', () => {

	const fields = { modelIndex: 12, frame: 3, colormap: 1, skin: 2, scale: 16, drawflags: 9, abslight: 5,
		origin: [ 1.25, - 2, 3 ], angles: [ 0, 90, 180 ] };
	const spawn = Hexen2_WriteBaseline( { entity: 77, ...fields } );
	check( spawn.ok, spawn.reason );
	const baseline = Hexen2_ReadBaseline( spawn.bytes );
	check( baseline.ok, baseline.reason );
	same( baseline.kind, 'spawnbaseline', 'the baseline kind' );
	same( baseline.baseline.entity, 77, 'the baseline entity' );
	same( baseline.baseline.modelIndex, 12, 'model index' );
	same( baseline.baseline.frame, 3, 'frame' );
	same( baseline.baseline.colormap, 1, 'colormap' );
	same( baseline.baseline.skin, 2, 'skin' );
	same( baseline.baseline.scale, 16, 'scale' );
	same( baseline.baseline.drawflags, 9, 'draw flags' );
	same( baseline.baseline.abslight, 5, 'absolute light' );
	near( baseline.baseline.origin[ 0 ], 1.25, 'baseline origin x' );
	near( baseline.baseline.origin[ 1 ], - 2, 'baseline origin y' );
	near( baseline.baseline.angles[ 1 ], 90, 'baseline angle y' );
	near( baseline.baseline.angles[ 2 ], 180, 'baseline angle z' );

	const staticEntity = Hexen2_ReadBaseline( Hexen2_WriteSpawnStatic( fields ).bytes );
	check( staticEntity.ok, staticEntity.reason );
	same( staticEntity.kind, 'spawnstatic', 'the static kind' );
	same( staticEntity.baseline.entity, undefined, 'a static entity has no number on the wire' );
	same( staticEntity.baseline.modelIndex, 12, 'the static model' );

	const bytes = spawn.bytes;
	check( Hexen2_ReadBaseline( bytes.subarray( 0, bytes.length - 1 ) ).ok === false, 'truncated baseline' );
	check( Hexen2_ReadBaseline( Uint8Array.from( [ ...bytes, 0 ] ) ).ok === false, 'trailing baseline bytes' );
	check( Hexen2_ReadBaseline( Uint8Array.from( [ 200, 0 ] ) ).ok === false, 'an unknown baseline opcode' );

} );

function minimal_bytes() { return Hexen2_WriteEntityUpdate( { entity: 4, origin: [ 1, 0, 0 ] } ).bytes; }

Deno.test( 'entity frame references and clear-edict lists round-trip', () => {

	const reference = Hexen2_WriteReference( { frame: 3, sequence: 7 } );
	check( reference.ok, reference.reason );
	const readReference = Hexen2_ReadReference( reference.bytes );
	check( readReference.ok, readReference.reason );
	same( readReference.reference.frame, 3, 'the frame' );
	same( readReference.reference.sequence, 7, 'the sequence' );

	const clear = Hexen2_WriteClearEdicts( [ 4, 9, 300 ] );
	check( clear.ok, clear.reason );
	const readClear = Hexen2_ReadClearEdicts( clear.bytes );
	check( readClear.ok, readClear.reason );
	same( readClear.entities.join( ',' ), '4,9,300', 'the cleared entity list' );

	check( Hexen2_WriteReference( { frame: 256, sequence: 0 } ).ok === false, 'an out-of-range frame' );
	check( Hexen2_WriteClearEdicts( new Array( 256 ).fill( 0 ) ).ok === false, 'a clear list over 255' );
	check( Hexen2_ReadClearEdicts( clear.bytes.subarray( 0, clear.bytes.length - 1 ) ).ok === false, 'a truncated clear list' );
	check( Hexen2_ReadReference( Uint8Array.from( [ 47, 1 ] ) ).ok === false, 'a short reference' );

} );
