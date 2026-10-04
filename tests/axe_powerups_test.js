// Native W_FireAxe -> trace -> T_Damage -> Killed/death callback. Presentation
// metadata is observed only after native QC has confirmed the outcome.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as pak from '../src/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { Mod_Init } from '../src/gl_model.js';
import { PR_InitBuiltins } from '../src/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/pr_exec.js';
import * as progs from '../src/progs.js';
import { ED_FindFunction, ED_NewString, GetEdictFieldValue } from '../src/pr_edict.js';
import { sv, svs, client_t } from '../src/server.js';
import { SV_SpawnServer, SV_SaveSpawnparms, SV_RestorePowerups, SV_ClearCarriedPowerups } from '../src/sv_main.js';
import { SV_Move, SV_LinkEdict, MOVE_NOMONSTERS } from '../src/world.js';
import { sv_gravity } from '../src/sv_phys.js';
import * as vars from '../src/cvar.js';
import { Cbuf_Init } from '../src/cmd.js';
import { SZ_Alloc } from '../src/common.js';
import { r_hdr } from '../src/gl_post.js';
import { skill } from '../src/host.js';
import { R_AnimSetClassicPass } from '../src/r_anim.js';
import { R_AxeSwingNormal } from '../src/r_axepose.js';
import { R_NewerSkinSalt } from '../src/r_newerskins.js';
import { IT_QUAD, IT_INVULNERABILITY, IT_INVISIBILITY, IT_SUIT } from '../src/quakedef.js';
import { cls, ca_dedicated } from '../src/client.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} !== ${b}` );
const text = index => progs.PR_GetString( index );
function field( entity, name, value, integer = false ) { const slot = GetEdictFieldValue( entity, name ); check( slot, 'native QC field exists: ' + name ); if ( integer ) slot.accessor.setInt32( slot.ofs, value ); else slot.accessor.setFloat( slot.ofs, value ); }
function readField( entity, name ) { const slot = GetEdictFieldValue( entity, name ); check( slot, 'native QC field exists: ' + name ); return slot.accessor.getFloat( slot.ofs ); }
const bytes = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) ); VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); Cbuf_Init();
for ( const value of [ r_hdr, skill, sv_gravity ] ) if ( ! vars.Cvar_FindVar( value.name ) ) vars.Cvar_RegisterVariable( value );
function fixture( options = {} ) {

	R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', options.classic ? 0 : 1 ); vars.Cvar_SetValue( 'skill', 1 ); svs.maxclients = 1; svs.clients = [ new client_t() ]; SZ_Alloc( svs.clients[ 0 ].message, 16384 ); sv.active = false; SV_SpawnServer( options.map || 'e1m1' );
	const player = svs.clients[ 0 ].edict; progs.pr_global_struct.self = progs.EDICT_TO_PROG( player ); PR_ExecuteProgram( progs.pr_global_struct.SetNewParms ); PR_ExecuteProgram( progs.pr_global_struct.ClientConnect ); PR_ExecuteProgram( progs.pr_global_struct.PutClientInServer );
	const target = sv.edicts.find( e => e && ! e.free && text( e.v.classname ) === ( options.target || 'monster_army' ) ); check( target, 'actual spawned native target ' + ( options.target || 'monster_army' ) ); const nativeOrigin = Array.from( target.v.origin );
	for ( const enemy of sv.edicts.filter( e => e && ! e.free && text( e.v.classname ).startsWith( 'monster_' ) ) ) { enemy.v.solid = 0; SV_LinkEdict( enemy, false ); }
	player.v.origin = [ 128, 1008, -199.95 ]; player.v.velocity = [ 0, 0, 0 ]; player.v.v_angle = [ 0, options.miss ? 180 : 0, 0 ]; player.v.angles = [ 0, 0, 0 ]; player.v.weaponframe = options.frame ?? 3;
	target.v.origin = options.nativePosition ? nativeOrigin : [ 176, 1008, -199.95 ]; target.v.velocity = [ 0, 0, 0 ]; target.v.solid = 3; target.v.takedamage = options.undamageable ? 0 : 2; target.v.health = options.health ?? 40; target.v.armorvalue = options.armor ?? 0; target.v.armortype = .8; field( target, 'invincible_finished', options.immune ? sv.time + 100 : 0 );
	field( player, 'super_damage_finished', options.quad ? sv.time + 100 : options.expired ? sv.time - .01 : 0 ); field( player, 'invincible_finished', options.pent ? sv.time + 100 : 0 );
	SV_LinkEdict( player, false ); SV_LinkEdict( target, false );
	if ( options.nativePosition ) {

		let placed = false;
		for ( const yaw of [ 0, 90, 180, 270, 45, 135, 225, 315 ] ) {

			const radians = yaw * Math.PI / 180, direction = [ Math.cos( radians ), Math.sin( radians ), 0 ], position = nativeOrigin.map( ( value, i ) => value - direction[ i ] * 56 );
			const fit = SV_Move( position, player.v.mins, player.v.maxs, position, MOVE_NOMONSTERS, player ); if ( fit.startsolid || fit.allsolid ) continue;
			const source = position.map( ( value, i ) => value + ( i === 2 ? 16 : 0 ) ), end = source.map( ( value, i ) => value + direction[ i ] * 64 ), sight = SV_Move( source, [ 0, 0, 0 ], [ 0, 0, 0 ], end, 0, player );
			if ( sight.ent !== target ) continue; player.v.origin = position; player.v.v_angle = [ 0, yaw, 0 ]; player.v.angles = [ 0, yaw, 0 ]; placed = true; SV_LinkEdict( player, false ); break;

		}
		check( placed, 'real native target has reachable axe-range player hull and trace' );

	}
	for ( const entity of [ player, target ] ) { const fit = SV_Move( entity.v.origin, entity.v.mins, entity.v.maxs, entity.v.origin, MOVE_NOMONSTERS, entity ); check( ! fit.startsolid, 'native combat fixture hull fits map' ); }
	return { player, target };

}
function swing( f ) { progs.pr_global_struct.self = progs.EDICT_TO_PROG( f.player ); const fn = ED_FindFunction( 'W_FireAxe' ); check( fn, 'shipped native axe function' ); PR_ExecuteProgram( progs.pr_functions.indexOf( fn ) ); }
const corpses = () => sv.edicts.filter( e => e && ! e.free && e._axeCorpse );
const gibs = () => sv.edicts.filter( e => e && ! e.free && /^progs\/(gib[123]|h_[a-z0-9_]+)\.mdl$/.test( text( e.v.model ) ) );

Deno.test( 'native axe miss, normal hit, nonfatal Quad, expired Quad and pentagram-only preserve stock damage without cut records', () => {

	for ( const [ options, expected ] of [ [ { miss: true, quad: true }, 40 ], [ { health: 100 }, 80 ], [ { health: 10 }, -10 ], [ { health: 120, quad: true }, 40 ], [ { health: 100, expired: true }, 80 ], [ { health: 100, pent: true }, 80 ], [ { quad: true, pent: true, immune: true }, 40 ], [ { quad: true, pent: true, undamageable: true }, 40 ] ] ) {

		const f = fixture( options ); swing( f ); same( f.target.v.health, expected, 'real native hit result ' + JSON.stringify( options ) ); same( corpses().length, 0, 'nonfatal/miss/immune outcomes create no cosmetic cut' ); check( ! f.target._axeSuppressed, 'original body remains visible for a surviving target' );

	}

} );

Deno.test( 'both native lethal Quad swing frames record actual target pose only after Killed and retain native death bookkeeping', () => {

	const normals = [];
	for ( const frame of [ 3, 7 ] ) {

		const f = fixture( { quad: true, health: 40, frame } ), killed = progs.pr_global_struct.killed_monsters, original = { model: text( f.target.v.model ), frame: f.target.v.frame | 0, origin: Array.from( f.target.v.origin ), skinSalt: R_NewerSkinSalt() };
		swing( f ); check( f.target.v.health <= 0, 'native Quad strike is lethal' ); same( progs.pr_global_struct.killed_monsters, killed + 1, 'native Killed still increments actual monster counter once' ); same( corpses().length, 1, 'one presentation record after confirmed kill' );
		const corpse = corpses()[ 0 ], record = corpse._axeCorpse; same( record.model, original.model, 'record captures living original model before native gib replacement' ); same( record.frame, original.frame, 'record captures actual impact pose' ); same( record.origin.join(), original.origin.join(), 'record captures original native impact location' ); same( corpse.v.solid, 0, 'cosmetic owner cannot change gameplay collision' ); same( corpse.v.movetype, 0, 'cosmetic owner does not enter native body physics' ); same( corpse.v.nextthink, sv.time + 30, 'native lifetime schedules bounded cleanup' );
		same( record.skinSalt, original.skinSalt, 'actual native death hook captures current material-variant salt' ); same( record.entityIndex, f.target.index, 'actual native death hook captures actor identity for the same variant' );
		check( f.target._axeSuppressed && f.target._axeSuppressedBy === corpse.index, 'native body waits for confirmed render replacement' ); check( Math.abs( Math.hypot( ...record.normal ) - 1 ) < 1e-6, 'captured actual swing plane has unit normal' ); normals.push( record.normal );

	}
	check( normals[ 0 ].some( ( value, i ) => Math.abs( value - normals[ 1 ][ i ] ) > .05 ), 'two native impact animations produce distinct cut planes' );

} );

Deno.test( 'Quad plus pentagram raises real native axe damage to lethal gib outcome while native immunity and excluded modes remain authoritative', () => {

	const f = fixture( { quad: true, pent: true, health: 5000, armor: 200 } ), before = progs.pr_global_struct.killed_monsters; swing( f ); check( f.target.v.health < -35, 'combined native T_Damage is lethal beyond ordinary80damage even with armor' ); same( progs.pr_global_struct.killed_monsters, before + 1, 'combo retains native death counter' ); check( gibs().length >= 4, 'native soldier death produces real head and gib entities' ); same( corpses().length, 0, 'combo does not also create a bisection corpse' );
	for ( const options of [ { classic: true }, { modifiedQC: true }, { multiplayer: true }, { dedicated: true } ] ) {

		const f = fixture( { ...options, quad: true, pent: true, health: 120 } ), crc = progs.pr_crc, state = cls.state;
		try { if ( options.modifiedQC ) progs.PR_SetCRC( crc ^ 1 ); if ( options.multiplayer ) svs.maxclients = 2; if ( options.dedicated ) cls.state = ca_dedicated; swing( f ); same( f.target.v.health, 40, 'excluded context retains native Quad80damage ' + JSON.stringify( options ) ); same( corpses().length, 0, 'excluded context no presentation mutation' ); }
		finally { progs.PR_SetCRC( crc ); svs.maxclients = 1; cls.state = state; }

	}

} );

Deno.test( 'cut normal matches independently decoded native blade edge and swept pose rather than a generic body axis', () => {

	const file = pak.COM_FindFile( 'progs/v_axe.mdl' ).data, data = Buffer.from( file ), scale = [ 8, 12, 16 ].map( at => data.readFloatLE( at ) ), origin = [ 20, 24, 28 ].map( at => data.readFloatLE( at ) );
	const first = 84 + 4 + data.readInt32LE( 52 ) * data.readInt32LE( 56 ) + 98 * 12 + 184 * 16;
	const vertex = ( pose, index ) => new THREE.Vector3( ...[ 0, 1, 2 ].map( axis => data[ first + pose * ( 28 + 98 * 4 ) + 28 + index * 4 + axis ] * scale[ axis ] + origin[ axis ] ) );
	for ( const frame of [ 3, 7 ] ) for ( const angles of [ [ 0, 0, 0 ], [ 15, 90, 0 ], [ -20, 231, 13 ] ] ) {

		const a = vertex( frame, 82 ), b = vertex( frame, 83 ), previous = vertex( frame - 1, 82 ).add( vertex( frame - 1, 83 ) ).multiplyScalar( .5 ), motion = a.clone().add( b ).multiplyScalar( .5 ).sub( previous );
		const matrix = new THREE.Matrix4().makeRotationZ( angles[ 1 ] * Math.PI / 180 ).multiply( new THREE.Matrix4().makeRotationY( angles[ 0 ] * Math.PI / 180 ) ).multiply( new THREE.Matrix4().makeRotationX( angles[ 2 ] * Math.PI / 180 ) );
		const expected = b.clone().sub( a ).cross( motion ).normalize().transformDirection( matrix ), actual = R_AxeSwingNormal( file, frame, angles ); check( actual && new THREE.Vector3( ...actual ).distanceTo( expected ) < 1e-6, 'native edge/pose/view oracle' );
	}
	const changed = file.slice(); changed[ changed.length - 1 ] ^= 1; same( R_AxeSwingNormal( changed, 3, [ 0, 0, 0 ] ), null, 'changed axe asset rejected by native identity guard' );
	const other = pak.COM_FindFile( 'progs/player.mdl' ).data; same( R_AxeSwingNormal( other, 3, [ 0, 0, 0 ] ), null, 'different file sharing original PAK backing buffer cannot reuse cached axe pose' );

} );

Deno.test( 'actual native zombie knockdown is not a confirmed fatal slice, while low-health Quad and combo preserve gib deaths', () => {

	const knocked = fixture( { map: 'e1m3', target: 'monster_zombie', nativePosition: true, quad: true, health: 120 } ); const beforeKilled = progs.pr_global_struct.killed_monsters; swing( knocked );
	console.log( 'NATIVE_ZOMBIE_QUAD_BOUNDARY ' + JSON.stringify( { health: knocked.target.v.health, model: text( knocked.target.v.model ), cuts: corpses().length, suppressed: knocked.target._axeSuppressed, think: text( progs.pr_functions[ knocked.target.v.think ]?.s_name || 0 ) } ) );
	check( knocked.target.v.health > 0, 'native zombie pain response survives a nonfatal Quad strike' ); same( progs.pr_global_struct.killed_monsters, beforeKilled, 'surviving zombie never reaches native Killed counter' ); same( corpses().length, 0, 'native recoverable zombie cannot receive fatal-cut metadata' ); check( ! knocked.target._axeSuppressed, 'recoverable zombie remains visible' );
	const ordinary = fixture( { map: 'e1m3', target: 'monster_zombie', nativePosition: true, health: 60 } ); swing( ordinary ); check( ordinary.target.v.health > 0 && corpses().length === 0 && ! ordinary.target._axeSuppressed, 'stock-health zombie ordinary axe pain/knockdown stays native' );
	for ( const pent of [ false, true ] ) {

		const f = fixture( { map: 'e1m3', target: 'monster_zombie', nativePosition: true, quad: true, pent, health: pent ? 60 : 20 } ); swing( f ); check( f.target.v.health <= 0, 'fatal native zombie strike remains dead' );
		if ( pent ) { same( corpses().length, 0, 'combined fatal zombie produces gibs rather than duplicate cut' ); check( gibs().length >= 3, 'actual native zombie gib branch runs' ); }
		else same( corpses().length, 1, 'only actual fatal Quad zombie produces a cut record' );

	}

} );

Deno.test( 'native fish and tarbaby death callbacks retain their behavior and receive real common-gib fallback on combined axe kills', () => {

	// Shareware PAK omits these two model assets. Use a real native soldier
	// collision/render shell and the shipped special death callbacks directly;
	// this proves callback/gib lifecycle, not unavailable fish/tarbaby art.
	for ( const [ classname, death, next ] of [ [ 'monster_fish', 'f_death1', 'f_death2' ], [ 'monster_tarbaby', 'tbaby_die1', 'tbaby_die2' ] ] ) {

		const f = fixture( { quad: true, pent: true, health: 500 } ), fn = ED_FindFunction( death ); check( fn, 'shipped special death callback exists' ); f.target.v.classname = ED_NewString( classname ); field( f.target, 'th_die', progs.pr_functions.indexOf( fn ), true );
		swing( f ); check( f.target.v.health <= 0 && f.target._axeSuppressed, 'confirmed special death retains callback but suppresses native body presentation' ); same( corpses().length, 0, 'combined special death creates no duplicate slice' );
		const nativeGibs = gibs(); same( nativeGibs.length, 6, 'six actual shared native gib entities supplied for missing ordinary gib branch' );
		for ( const gib of nativeGibs ) { check( gib.v.modelindex > 0 && sv.model_precache[ gib.v.modelindex ] === text( gib.v.model ), 'gib uses actual current native model precache' ); same( gib.v.movetype, 6, 'native tossed gib physics' ); same( gib.v.nextthink, sv.time + 30, 'bounded native removal think' ); }
		same( text( progs.pr_functions[ f.target.v.think ].s_name ), next, 'native special callback continuation retained' );

	}

} );

Deno.test( 'Quad axe fatal strikes reach native death and cut metadata for every other available projectile-damageable monster type', () => {

	const coverage = [];
	for ( const [ map, target ] of [ [ 'e1m1', 'monster_army' ], [ 'e1m1', 'monster_dog' ], [ 'e1m2', 'monster_knight' ], [ 'e1m2', 'monster_ogre' ], [ 'e1m2', 'monster_demon1' ], [ 'e1m7', 'monster_shambler' ], [ 'e1m3', 'monster_wizard' ] ] ) {

		const f = fixture( { map, target, nativePosition: true, quad: true, health: 20 } ), original = text( f.target.v.model ), deaths = progs.pr_global_struct.killed_monsters; swing( f );
		check( f.target.v.health <= 0, 'actual native axe trace kills ' + target ); same( progs.pr_global_struct.killed_monsters, deaths + 1, 'native death bookkeeping exactly once for ' + target ); same( corpses().length, 1, 'one captured cut pose for ' + target ); same( corpses()[ 0 ]._axeCorpse.model, original, 'original impact model captured for ' + target );
		coverage.push( { map, target, model: original, healthAfter: f.target.v.health } );

	}
	console.log( 'NATIVE_AXE_MONSTER_COVERAGE ' + JSON.stringify( coverage ) );

} );

function captureTravel( { classic = false } = {} ) {

	SV_ClearCarriedPowerups(); const f = fixture( { classic } ), client = svs.clients[ 0 ]; client.active = true;
	sv.time = 20; progs.pr_global_struct.time = 20; f.player.v.items = ( f.player.v.items | IT_QUAD | IT_INVULNERABILITY | IT_INVISIBILITY ) & ~IT_SUIT;
	field( f.player, 'super_damage_finished', 32.5 ); field( f.player, 'invincible_finished', 27.25 ); field( f.player, 'invisible_finished', 18 ); field( f.player, 'radsuit_finished', 29 );
	for ( const name of [ 'super_time', 'invincible_time', 'invisible_time', 'rad_time' ] ) field( f.player, name, 0 );
	SV_SaveSpawnparms(); same( client.active, true, 'real active client participates in native SaveSpawnparms' ); return { client, source: f.player };

}
function nativeArrival( client, map = 'e1m2' ) {

	// Suppress network reconnect only; the real client stays active through
	// the new server's initialization and serverinfo serialization.
	sv.active = false; SV_SpawnServer( map ); same( svs.clients[ 0 ], client, 'same native client retains saved spawn parameters' );
	const player = client.edict; player.clearFields(); player.v.colormap = 1; player.v.team = 1; player.v.netname = ED_NewString( 'powerup-carry-test' );
	for ( let i = 0; i < client.spawn_parms.length; i ++ ) progs.pr_global_struct[ 'parm' + ( i + 1 ) ] = client.spawn_parms[ i ];
	progs.pr_global_struct.self = progs.EDICT_TO_PROG( player ); progs.pr_global_struct.time = sv.time; PR_ExecuteProgram( progs.pr_global_struct.ClientConnect ); PR_ExecuteProgram( progs.pr_global_struct.PutClientInServer );
	return player;

}

Deno.test( 'active-client native spawn-parameter travel restores real Quad/Pentagram timers once and the carried combo drives native lethal axe damage', () => {

	const { client, source } = captureTravel(), player = nativeArrival( client );
	check( ( player.v.items & ( IT_QUAD | IT_INVULNERABILITY | IT_INVISIBILITY | IT_SUIT ) ) === 0, 'stock new-map QC spawn initially leaves temporary power-ups behind' );
	SV_RestorePowerups( player );
	check( ( player.v.items & IT_QUAD ) !== 0 && ( player.v.items & IT_INVULNERABILITY ) !== 0, 'public restore reinstates both active native item bits' );
	same( readField( player, 'super_damage_finished' ), sv.time + 12.5, 'Quad retains exact remaining duration across reset map clock' ); same( readField( player, 'invincible_finished' ), sv.time + 7.25, 'Pentagram retains exact remaining duration' );
	same( readField( player, 'super_time' ), 1, 'native Quad warning flag restored through QC field storage' ); same( readField( player, 'invincible_time' ), 1, 'native Pentagram warning flag restored through QC field storage' );
	check( ( player.v.items & ( IT_INVISIBILITY | IT_SUIT ) ) === 0 && readField( player, 'invisible_finished' ) <= sv.time && readField( player, 'radsuit_finished' ) <= sv.time, 'expired ring and timer without item bit do not carry' );
	for ( const entity of [ source, player ] ) for ( const name of [ 'super_damage_finished', 'invincible_finished', 'super_time', 'invincible_time' ] ) check( ! Object.hasOwn( entity.v, name ), 'real QC timers/flags never become JS expando properties' );
	const finish = readField( player, 'super_damage_finished' ); sv.time += .5; SV_RestorePowerups( player ); same( readField( player, 'super_damage_finished' ), finish, 'second restore cannot restart or extend the consumed timer' );
	const target = sv.edicts.find( entity => ! entity.free && text( entity.v.classname ) === 'monster_army' ); check( target, 'actual destination map supplies native damageable target' );
	for ( const other of sv.edicts.filter( entity => ! entity.free && text( entity.v.classname ).startsWith( 'monster_' ) ) ) { other.v.solid = 0; SV_LinkEdict( other, false ); }
	target.v.solid = 3; target.v.health = 5000; target.v.armorvalue = 0; target.v.takedamage = 2; SV_LinkEdict( target, false ); let placed = false;
	for ( const yaw of [ 0, 90, 180, 270, 45, 135, 225, 315 ] ) {

		const direction = [ Math.cos( yaw * Math.PI / 180 ), Math.sin( yaw * Math.PI / 180 ), 0 ], position = Array.from( target.v.origin, ( value, i ) => value - direction[ i ] * 56 );
		if ( SV_Move( position, player.v.mins, player.v.maxs, position, MOVE_NOMONSTERS, player ).startsolid ) continue;
		const start = position.map( ( value, i ) => value + ( i === 2 ? 16 : 0 ) ), end = start.map( ( value, i ) => value + direction[ i ] * 64 );
		if ( SV_Move( start, [ 0, 0, 0 ], [ 0, 0, 0 ], end, 0, player ).ent !== target ) continue;
		player.v.origin = position; player.v.v_angle = [ 0, yaw, 0 ]; player.v.weaponframe = 3; SV_LinkEdict( player, false ); placed = true; break;

	}
	check( placed, 'destination axe strike has real clear player hull and native trace' ); progs.pr_global_struct.time = sv.time; swing( { player } ); check( target.v.health < -35, 'carried timers activate actual combined-power native W_FireAxe kill after new-map spawn' ); same( corpses().length, 0, 'carried combo produces native gibs rather than a duplicate slice' ); check( gibs().length >= 4, 'actual native gib death remains active after carry' );
	console.log( 'NATIVE_POWERUP_TRAVEL_AXE ' + JSON.stringify( { destination: sv.name, quadFinished: readField( player, 'super_damage_finished' ), pentagramFinished: readField( player, 'invincible_finished' ), destinationTime: sv.time, targetHealth: target.v.health } ) ); SV_ClearCarriedPowerups(); client.active = false;

} );

Deno.test( 'Classic capture/restore and explicit fresh-run clearing cannot inherit enhanced travel timers', () => {

	for ( const mode of [ 'classic-capture', 'classic-restore', 'fresh-run-clear' ] ) {

		const { client } = captureTravel( { classic: mode === 'classic-capture' } );
		if ( mode === 'classic-restore' ) vars.Cvar_SetValue( 'r_hdr', 0 );
		if ( mode === 'fresh-run-clear' ) SV_ClearCarriedPowerups();
		const player = nativeArrival( client ), before = Buffer.from( player._fieldBuffer ).toString( 'hex' ); SV_RestorePowerups( player );
		same( Buffer.from( player._fieldBuffer ).toString( 'hex' ), before, mode + ' leaves native spawn fields entirely unchanged' );
		vars.Cvar_SetValue( 'r_hdr', 1 ); SV_RestorePowerups( player ); same( Buffer.from( player._fieldBuffer ).toString( 'hex' ), before, 'failed/Classic/fresh restore consumes or discards carry rather than leaking it into a later mode' );
		client.active = false; SV_ClearCarriedPowerups();

	}

} );
