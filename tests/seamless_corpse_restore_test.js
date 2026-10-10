// Actual native BSP crossings, QuakeC damage, server respawn and baseline creation.
// No private seamless state access or substitute serialization/model lookup.
import { readFileSync } from 'node:fs';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/progs/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { ED_NewString, ED_Alloc, ED_Free } from '../src/engine/progs/pr_edict.js';
import * as progs from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3 } from '../src/engine/progs/pr_comp.js';
import { sv, svs, client_t, FL_CLIENT } from '../src/engine/server/server.js';
import { SV_SpawnServer, SV_ModelIndex } from '../src/engine/server/sv_main.js';
import { SV_SeamlessReset, SV_SeamlessFrame, SV_SeamlessCrossings, SV_SeamlessPending,
	SV_SeamlessPlacePlayer, SV_SeamlessHolding, SV_LevelSnapshotEntities, sv_seamless } from '../src/newer/gameplay/sv_seamless.js';
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable } from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/gl_post.js';
import { skill } from '../src/engine/server/host.js';
import { sv_gravity, SV_Physics, SV_SetFrametime } from '../src/engine/server/sv_phys.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const equal = ( actual, expected, label ) => check( actual === expected, `${label}: ${actual} != ${expected}` );
const string = index => progs.PR_GetString( index );
const pack = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.byteLength ) ) );
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); Cbuf_Init();
for ( const variable of [ r_hdr, skill, sv_gravity ] ) if ( ! Cvar_FindVar( variable.name ) ) Cvar_RegisterVariable( variable );

function player() {
	const entity = svs.clients[ 0 ].edict;
	entity.v.classname = ED_NewString( 'player' ); entity.v.health = 100; entity.v.flags = FL_CLIENT;
	entity.v.mins = [ -16, -16, -24 ]; entity.v.maxs = [ 16, 16, 32 ];
	return entity;
}
function cross( destination ) {
	const crossing = SV_SeamlessCrossings().find( value => value.map === destination );
	check( crossing, 'native doorway exists for ' + destination );
	const t = crossing.transform, entity = player();
	entity.v.origin = t.center.map( ( value, i ) => value - t.through[ i ] * 8 ); SV_SeamlessFrame();
	entity.v.origin = t.center.map( ( value, i ) => value + t.through[ i ] * 8 ); SV_SeamlessFrame();
	const arrival = SV_SeamlessPending(); check( arrival?.map === destination, 'public crossing queued ' + destination );
	// Network clients are inactive: actual server loading and baseline creation
	// execute, without an unrelated network reconnect or browser/game process.
	sv.active = false; SV_SpawnServer( destination );
	const arrived = player(); arrived.v.origin = arrival.origin;
	SV_SeamlessPlacePlayer( arrived ); svs.clients[ 0 ].spawned = true; SV_SeamlessHolding( 1 );
	sv.time += 5; SV_SeamlessFrame(); return arrival;
}
function setupKnight() {
	SV_SeamlessReset(); r_hdr.value = 1; sv_seamless.value = 2; skill.value = 1;
	svs.maxclients = 1; svs.clients = [ new client_t() ]; sv.active = false; SV_SpawnServer( 'e1m2' );
	const knight = sv.edicts.find( entity => entity && ! entity.free && string( entity.v.classname ) === 'monster_knight' );
	check( knight && knight.v.health > 0, 'native living E1M2 knight' );
	const t = SV_SeamlessCrossings().find( value => value.map === 'e1m3' ).transform;
	knight.v.origin = t.center.map( ( value, i ) => value - t.through[ i ] * 40 ); knight.v.enemy = progs.EDICT_TO_PROG( player() );
	const arrival = cross( 'e1m3' ); equal( arrival.followers.length, 1, 'one native knight follows' );
	const traveller = sv.edicts.find( entity => entity && ! entity.free && string( entity.v.classname ) === 'monster_knight' );
	check( traveller, 'travelling knight is placed in E1M3' ); return traveller;
}
function damage( target, amount ) {
	const shooter = player(); progs.pr_globals_int[ OFS_PARM0 ] = progs.EDICT_TO_PROG( target );
	progs.pr_globals_int[ OFS_PARM1 ] = progs.EDICT_TO_PROG( shooter ); progs.pr_globals_int[ OFS_PARM2 ] = progs.EDICT_TO_PROG( shooter );
	progs.pr_globals_float[ OFS_PARM3 ] = amount; progs.pr_global_struct.self = progs.EDICT_TO_PROG( shooter );
	const fn = progs.pr_functions.findIndex( value => string( value.s_name ) === 'T_Damage' ); PR_ExecuteProgram( fn );
}

Deno.test( 'travelling knight dies in E1M3, survives E1M2 return and repeated E1M3 server/baseline restore without resurrection or missing model', () => {
	const knight = setupKnight(); damage( knight, knight.v.health + 5 );
	check( knight.v.health <= 0, 'native T_Damage killed knight' ); equal( string( knight.v.model ), 'progs/knight.mdl', 'native non-gib corpse keeps knight model' );
	// Finish the native death animation before recording a stable corpse pose.
	// SV_SpawnServer legitimately runs two physics frames after restoring state.
	SV_SetFrametime( .1 );
	for ( let frame = 0; frame < 20; frame ++ ) SV_Physics();
	const health = knight.v.health, frame = knight.v.frame, origin = Array.from( knight.v.origin );
	const total = progs.pr_global_struct.total_monsters, killed = progs.pr_global_struct.killed_monsters;
	for ( let cycle = 0; cycle < 2; cycle ++ ) {
		cross( 'e1m2' );
		const saved = SV_LevelSnapshotEntities( 'e1m3' ).filter( entity => entity.model === 'progs/knight.mdl' );
		equal( saved.length, 1, 'one saved travelling corpse' ); equal( Number( saved[ 0 ].health ), health, 'saved dead health' );
		cross( 'e1m3' ); // Old implementation throws SV_ModelIndex here.
		const corpses = sv.edicts.filter( entity => entity && ! entity.free && string( entity.v.model ) === 'progs/knight.mdl' );
		equal( corpses.length, 1, 'one restored corpse' ); const corpse = corpses[ 0 ];
		equal( corpse.v.health, health, 'dead health preserved' ); equal( corpse.v.frame, frame, 'death pose preserved' );
		check( origin.every( ( value, i ) => value === corpse.v.origin[ i ] ), 'corpse location preserved' );
		equal( corpse.v.modelindex, SV_ModelIndex( 'progs/knight.mdl' ), 'corpse index matches current precache' );
		check( sv.models[ corpse.v.modelindex ]?.name === 'progs/knight.mdl', 'actual model loaded before server activation/baseline' );
		equal( sv.edicts.filter( entity => entity && ! entity.free && string( entity.v.classname ) === 'monster_knight' && entity.v.health > 0 ).length, 0, 'no resurrected knight' );
		equal( progs.pr_global_struct.total_monsters, total, 'destination monster tally preserved' );
		equal( progs.pr_global_struct.killed_monsters, killed, 'native kill tally preserved' );
	}
} );

Deno.test( 'first-arrival native knight gib death has head resources, and restored heads/gibs/tombstones remain valid', () => {
	const knight = setupKnight();
	check( sv.model_precache.includes( 'progs/h_knight.mdl' ), 'head precached before native death' );
	check( sv.sound_precache.includes( 'knight/kdeath.wav' ), 'native knight death sound precached' );
	damage( knight, 200 ); equal( string( knight.v.model ), 'progs/h_knight.mdl', 'stock death produced knight head' );
	const gibs = sv.edicts.filter( entity => entity && ! entity.free && /^progs\/gib[123]\.mdl$/.test( string( entity.v.model ) ) );
	equal( gibs.length, 3, 'stock death produced three gib models' );
	const tombstone = ED_Alloc(); tombstone.v.classname = ED_NewString( 'discarded' ); tombstone.v.model = ED_NewString( 'progs/knight.mdl' );
	ED_Free( tombstone ); const freeIndex = tombstone.index;
	cross( 'e1m2' ); cross( 'e1m3' );
	check( sv.edicts[ freeIndex ].free, 'free serialized tombstone remains free' );
	const restored = sv.edicts.filter( entity => entity && ! entity.free && /^(progs\/h_knight\.mdl|progs\/gib[123]\.mdl)$/.test( string( entity.v.model ) ) );
	equal( restored.length, 4, 'head and three gibs restored once' );
	for ( const entity of restored ) {
		const name = string( entity.v.model ); equal( entity.v.modelindex, SV_ModelIndex( name ), 'restored head/gib index remapped' );
		check( sv.models[ entity.v.modelindex ]?.name === name, 'restored head/gib native model loaded' );
	}
	equal( restored.find( entity => string( entity.v.model ) === 'progs/h_knight.mdl' ).v.health, knight.v.health, 'head remains dead' );
} );
