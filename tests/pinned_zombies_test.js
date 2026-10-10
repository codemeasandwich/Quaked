// Real stock QuakeC spawn, shotgun traces, damage/death and save fields.
// Only the renderer/audio devices are absent; no substitute damage function.
import { readFileSync } from 'node:fs';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/progs/pr_cmds.js';
import { PR_LoadProgs, PR_AllocEdicts, ED_LoadFromFile, ED_NewString, ED_Write, ED_ClearEdict, ED_ParseEdict, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3 } from '../src/engine/progs/pr_comp.js';
import { sv, svs, ss_loading, ss_active, SOLID_BSP, SOLID_SLIDEBOX, MOVETYPE_NONE, MOVETYPE_WALK, MOVETYPE_PUSH, FL_CLIENT, DAMAGE_AIM } from '../src/engine/server/server.js';
import { SV_ClearWorld, SV_LinkEdict, SV_Move } from '../src/engine/server/world.js';
import { SV_PinnedZombieSpawned } from '../src/newer/gameplay/sv_pinnedzombies.js';
import { R_AnimSetClassicPass } from '../src/newer/render/r_anim.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const fn = name => progs.pr_functions.findIndex( f => progs.PR_GetString( f.s_name ) === name );
const text = index => progs.PR_GetString( index );
const functionName = index => text( progs.pr_functions[ index ].s_name );
function callback( entity, name ) { const field = GetEdictFieldValue( entity, name ); return field.accessor.getInt32( field.ofs ); }

const pak = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.byteLength ) ) );
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( r_hdr );

function setup( newer, spawnflags = 1 ) {

	R_AnimSetClassicPass( false ); Cvar_SetValue( 'r_hdr', newer ? 1 : 0 );
	const binary = COM_FindFile( 'progs.dat' ).data;
	PR_LoadProgs( binary.buffer.slice( binary.byteOffset, binary.byteOffset + binary.byteLength ) );
	progs.PR_SetSV( sv ); progs.PR_SetSVS( svs ); PR_InitBuiltins();
	svs.maxclients = 1;
	sv.edicts = PR_AllocEdicts( 64, progs.progs.entityfields ); sv.max_edicts = 64; sv.num_edicts = 2;
	sv.time = 1; sv.state = ss_loading; sv.active = true;
	sv.worldmodel = Mod_ForName( 'maps/start.bsp', true );
	sv.models = [ null, sv.worldmodel ];
	sv.model_precache = [ '', 'maps/start.bsp' ];
	for ( const name of [ 'progs/gib1.mdl', 'progs/gib2.mdl', 'progs/gib3.mdl' ] ) {

		sv.model_precache.push( name ); sv.models.push( Mod_ForName( name, true ) );

	}
	sv.sound_precache = [ '', 'weapons/guncock.wav' ];
	for ( const key of [ 'datagram', 'reliable_datagram', 'signon' ] ) {

		sv[ key ].data = new Uint8Array( 8192 ); sv[ key ].maxsize = 8192; sv[ key ].cursize = 0; sv[ key ].allowoverflow = false;

	}
	sv.edicts[ 0 ].v.solid = SOLID_BSP; sv.edicts[ 0 ].v.movetype = MOVETYPE_PUSH; sv.edicts[ 0 ].v.modelindex = 1;
	SV_ClearWorld();
	// The first record occupies world edict zero. SUB_Null deliberately keeps
	// this fixture's actual START BSP rather than spawning unrelated monsters.
	ED_LoadFromFile( '{ "classname" "SUB_Null" }\n' +
		`{ "classname" "monster_zombie" "spawnflags" "${spawnflags}" "origin" "1004 928 72" "angle" "180" }` );
	const target = sv.edicts[ 2 ], player = sv.edicts[ 1 ];
	player.v.classname = ED_NewString( 'player' ); player.v.health = 100; player.v.solid = SOLID_SLIDEBOX;
	player.v.movetype = MOVETYPE_WALK; player.v.flags = FL_CLIENT;
	player.v.origin.set( [ 928, 928, 72 ] ); player.v.view_ofs.set( [ 0, 0, 22 ] );
	player.v.mins.set( [ -16, -16, -24 ] ); player.v.maxs.set( [ 16, 16, 32 ] );
	player.v.size.set( [ 32, 32, 56 ] );
	player.v.ammo_shells = 10; player.v.currentammo = 10;
	SV_LinkEdict( player, false ); sv.state = ss_active;
	progs.pr_global_struct.time = sv.time;
	progs.pr_global_struct.v_forward.set( [ 1, 0, 0 ] );
	progs.pr_global_struct.v_right.set( [ 0, -1, 0 ] );
	progs.pr_global_struct.v_up.set( [ 0, 0, 1 ] );
	return { target, player };

}

function fire( player ) {

	progs.pr_global_struct.self = progs.EDICT_TO_PROG( player );
	const oldRandom = Math.random;
	const trace = progs.pr_builtins[ 16 ];
	const traces = [];
	try {
		progs.pr_builtins[ 16 ] = () => { trace(); traces.push( { entity: progs.pr_global_struct.trace_ent, fraction: progs.pr_global_struct.trace_fraction } ); };
		Math.random = () => .5; PR_ExecuteProgram( fn( 'W_FireShotgun' ) );
	}
	finally { Math.random = oldRandom; progs.pr_builtins[ 16 ] = trace; }
	return traces;

}

function damage( target, player, amount ) {

	progs.pr_globals_int[ OFS_PARM0 ] = target.index;
	progs.pr_globals_int[ OFS_PARM1 ] = player.index;
	progs.pr_globals_int[ OFS_PARM2 ] = player.index;
	progs.pr_globals_float[ OFS_PARM3 ] = amount;
	progs.pr_global_struct.self = player.index;
	PR_ExecuteProgram( fn( 'T_Damage' ) );

}

Deno.test( 'native pinned zombie in Newer Game takes real shotgun traces and dies through stock QuakeC gibs without changing monster counts', () => {

	const { target, player } = setup( true );
	same( target.v.health, 60, 'native health retained' ); same( target.v.takedamage, DAMAGE_AIM, 'native aim damage enabled' );
	same( target.v.movetype, MOVETYPE_NONE, 'stays fixed to wall' ); same( target.v.solid, SOLID_SLIDEBOX, 'native collision retained' );
	same( callback( target, 'th_pain' ), 0, 'pain cannot restart walking or heal damage' ); same( functionName( callback( target, 'th_die' ) ), 'zombie_die', 'native death callback retained' );
	check( /^zombie_cruc[1-6]$/.test( functionName( target.v.think ) ), 'native pinned animation retained' );
	const originalOrigin = Array.from( target.v.origin ), originalBounds = Array.from( target.v.mins ).concat( Array.from( target.v.maxs ) );
	const totals = [ progs.pr_global_struct.total_monsters, progs.pr_global_struct.killed_monsters ];
	const trace = SV_Move( [ 928, 928, 94 ], [ 0, 0, 0 ], [ 0, 0, 0 ], [ 1100, 928, 94 ], 0, player );
	same( trace.ent, target, 'actual START world trace hits pinned body before wall' );
	const shots = fire( player );
	same( shots.length, 6, 'actual weapon performed six pellet traces' );
	check( shots.every( hit => hit.entity === target.index && hit.fraction < 1 ), 'every actual pellet trace hit the native pinned body' );
	same( target.v.health, 36, 'six real shotgun pellets deal native 24 damage' );
	fire( player ); same( target.v.health, 12, 'second shot accumulates rather than resetting to 60' );
	same( JSON.stringify( Array.from( target.v.origin ) ), JSON.stringify( originalOrigin ), 'nonlethal damage stays pinned' );
	same( JSON.stringify( Array.from( target.v.mins ).concat( Array.from( target.v.maxs ) ) ), JSON.stringify( originalBounds ), 'nonlethal damage retains bounds' );
	const beforeGibs = sv.num_edicts;
	fire( player );
	same( player.v.ammo_shells, 7, 'native weapon consumed actual ammunition' );
	same( text( target.v.model ), 'progs/h_zombie.mdl', 'native ThrowHead replaced pinned body' );
	same( target.v.takedamage, 0, 'native head no longer damageable' );
	same( sv.num_edicts, beforeGibs + 3, 'native three gibs spawned' );
	check( sv.edicts.slice( beforeGibs, sv.num_edicts ).every( e => /^progs\/gib[123]\.mdl$/.test( text( e.v.model ) ) ), 'all native gib models present' );
	same( progs.pr_global_struct.total_monsters, totals[ 0 ], 'decorations add no monster total' );
	same( progs.pr_global_struct.killed_monsters, totals[ 1 ], 'native MOVETYPE_NONE death adds no kill tally' );

} );

Deno.test( 'classic pinned zombies retain native immunity and normal walking zombies retain native pain behavior', () => {

	let fixture = setup( false );
	same( fixture.target.v.takedamage, 0, 'classic pinned damage remains off' );
	same( functionName( callback( fixture.target, 'th_pain' ) ), 'zombie_pain', 'classic pain callback unchanged' );
	fire( fixture.player ); same( fixture.target.v.health, 60, 'classic real shotgun leaves pinned health unchanged' );
	same( text( fixture.target.v.model ), 'progs/zombie.mdl', 'classic body unchanged' );
	fixture = setup( true, 0 );
	same( functionName( callback( fixture.target, 'th_pain' ) ), 'zombie_pain', 'walking zombie still has native pain/recovery' );
	check( fixture.target.v.movetype !== MOVETYPE_NONE, 'normal zombie remains mobile' );
	same( SV_PinnedZombieSpawned( fixture.target ), false, 'normal zombie is not patched' );
	fixture = setup( true );
	const state = [ fixture.target.v.health, fixture.target.v.takedamage, callback( fixture.target, 'th_pain' ) ];
	same( SV_PinnedZombieSpawned( fixture.target ), false, 'repeated call is a no-op' );
	same( JSON.stringify( [ fixture.target.v.health, fixture.target.v.takedamage, callback( fixture.target, 'th_pain' ) ] ), JSON.stringify( state ), 'repeated call never heals or resets' );
	same( SV_PinnedZombieSpawned( null ), false, 'missing entity is ignored' );

} );

Deno.test( 'ordinary save fields retain accumulated pinned damage and restored zombie uses native T_Damage death', () => {

	const { target, player } = setup( true );
	fire( player ); fire( player );
	const record = []; ED_Write( record, target );
	const serialized = record.join( '\n' );
	ED_ClearEdict( target ); ED_ParseEdict( serialized.slice( serialized.indexOf( '{' ) + 1 ), target );
	SV_LinkEdict( target, false );
	same( target.v.health, 12, 'damage survives ordinary ED_Write/ED_ParseEdict' );
	same( target.v.takedamage, DAMAGE_AIM, 'damage flag survives save' );
	same( callback( target, 'th_pain' ), 0, 'null pain survives save' );
	same( functionName( callback( target, 'th_die' ) ), 'zombie_die', 'native death callback survives save' );
	damage( target, player, 12 );
	same( text( target.v.model ), 'progs/h_zombie.mdl', 'restored body dies through actual T_Damage and native zombie_die' );

} );

Deno.test( 'restoring a legacy living pinned zombie enables native damage only in Newer Game and preserves other saved fields', () => {

	// Produce a real legacy record through the native classic spawn/save path,
	// then exercise the same parse -> guarded initialization -> BSP link steps
	// used by Host_Loadgame_f. No new damage simulation or save format is used.
	for ( const newer of [ false, true ] ) {

		const { target, player } = setup( false );
		const records = []; ED_Write( records, target );
		const saved = records.join( '\n' );
		const health = target.v.health, think = target.v.think, nextthink = target.v.nextthink;
		const origin = Array.from( target.v.origin ), bounds = Array.from( target.v.mins ).concat( Array.from( target.v.maxs ) );
		ED_ClearEdict( target ); Cvar_SetValue( 'r_hdr', newer ? 1 : 0 );
		ED_ParseEdict( saved.slice( saved.indexOf( '{' ) + 1 ), target );
		same( target.v.takedamage, 0, 'legacy saved record really has DAMAGE_NO before restore hook' );
		same( functionName( callback( target, 'th_pain' ) ), 'zombie_pain', 'legacy saved native pain really restored' );
		same( SV_PinnedZombieSpawned( target ), newer, 'restore hook follows requested game mode' );
		SV_LinkEdict( target, false );
		same( target.v.health, health, 'restoration retains saved health' ); same( target.v.think, think, 'restoration retains pinned think' );
		same( target.v.nextthink, nextthink, 'restoration retains saved animation schedule' );
		same( JSON.stringify( Array.from( target.v.origin ) ), JSON.stringify( origin ), 'restoration retains saved wall position' );
		same( JSON.stringify( Array.from( target.v.mins ).concat( Array.from( target.v.maxs ) ) ), JSON.stringify( bounds ), 'restoration retains saved collision bounds' );
		damage( target, player, health );
		same( text( target.v.model ), newer ? 'progs/h_zombie.mdl' : 'progs/zombie.mdl', 'restored native T_Damage kills only enhanced legacy decoration' );
		same( progs.pr_global_struct.killed_monsters, 0, 'legacy restore changes no monster tally' );

	}

} );

Deno.test( 'restore guard preserves already-mortal damaged, dead, free, and nonnative callback records', () => {

	const { target, player } = setup( true );
	fire( player );
	same( SV_PinnedZombieSpawned( target ), false, 'already-mortal restored state needs no initialization' );
	same( target.v.health, 36, 'already-mortal state never heals' );
	damage( target, player, 36 );
	const deadModel = target.v.model, deadThink = target.v.think;
	same( SV_PinnedZombieSpawned( target ), false, 'native gib/head state is not resurrected' );
	same( target.v.model, deadModel, 'dead model retained' ); same( target.v.think, deadThink, 'native gib cleanup retained' );
	let record = setup( false ).target; Cvar_SetValue( 'r_hdr', 1 ); record.free = true;
	same( SV_PinnedZombieSpawned( record ), false, 'free save slot ignored' ); same( record.v.takedamage, 0, 'free slot unchanged' );
	record = setup( false ).target; Cvar_SetValue( 'r_hdr', 1 );
	const pain = GetEdictFieldValue( record, 'th_pain' ); pain.accessor.setInt32( pain.ofs, fn( 'SUB_Null' ) );
	same( SV_PinnedZombieSpawned( record ), false, 'nonnative saved callback is not overwritten' );
	same( record.v.takedamage, 0, 'nonnative record damage flag unchanged' );
	same( callback( record, 'th_pain' ), fn( 'SUB_Null' ), 'nonnative record pain callback retained' );

} );
