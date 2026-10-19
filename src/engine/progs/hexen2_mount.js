/**
 * @module engine/progs/hexen2_mount
 *
 * Starting a Hexen II level from the public selection data: a playable catalogue entry and a class become a validated
 * session plan, then the gamecode, palette, map and level entities are mounted through the engine's existing loaders
 * by their logical names (the host has mounted the game's paks) and the client's player is placed by the supplied
 * gamecode. This is the single "start game" path the shelf can call; the host still owns callback wiring and pak
 * mounting, as at engine start.
 *
 * Types: plain values and functions; no exported classes.
 * State: writes the server/client state it is given; no module state.
 * Errors: load failures are returned as `{ ok: false, reason }`, never thrown for missing content.
 */

import { COM_FindFile } from '../common/pak.js';
import { VID_SetPalette } from '../render/vid.js';
import { Mod_SetHexenHullLayout } from '../render/gl_model_bsp.js';
import { Mod_FindName } from '../render/gl_model_common.js';
import { PR_LoadProgs, PR_AllocEdicts } from './pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs as progsSvs } from './progs.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../server/world.js';
import { SV_SetState } from '../server/sv_phys.js';
import { sv as serverSv, ss_loading, SIGNON_SIZE } from '../server/server.js';
import { PR_ExecuteProgram } from './pr_exec.js';
import { Hexen2_CreateSession, Hexen2_SelectClass } from '../common/hexen2_profile.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from './hexen2_boot.js';

const DEFAULT_MAPS = Object.freeze( { hexen2: 'maps/demo1.bsp', 'hexen2-portals': 'maps/keep1.bsp', 'hexen2-demo': 'maps/demo1.bsp' } );

/**
 * The selection plan for a playable catalogue entry.
 *
 * @param {object} entry a catalogue entry (`id`, `playable`, `folder`)
 * @param {{ classId: string, gamecodeMode?: string, rules?: string, level?: string }} options the chosen class and
 *   optional gamecode mode, rules preset and start map
 * @returns {{ ok: true, session: object, classId: string, classNumber: number, startMap: string,
 *   labels: object } | { ok: false, reason: string }} the plan, or why the selection is refused
 */
export function Hexen2_PlanStart( entry, options ) {

	if ( ! entry || typeof entry !== 'object' ) return { ok: false, reason: 'no catalogue entry' };
	if ( ! entry.playable ) return { ok: false, reason: 'the catalogue entry is not playable' };
	const gameId = String( entry.id ?? '' );
	if ( ! Object.hasOwn( DEFAULT_MAPS, gameId ) ) return { ok: false, reason: `not a Hexen II entry: ${gameId}` };
	const gamecodeMode = options.gamecodeMode ?? 'installed';
	const rules = options.rules ?? 'classic';
	const created = Hexen2_CreateSession( { gameId, contentRoot: String( entry.folder ?? '' ), gamecodeMode, rules } );
	if ( ! created.ok ) return created;
	const klass = Hexen2_SelectClass( gameId, options.classId );
	if ( ! klass.ok ) return klass;
	return {
		ok: true,
		session: created.session,
		classId: klass.classId,
		classNumber: klass.number,
		startMap: options.level ?? DEFAULT_MAPS[ gameId ],
		labels: Object.freeze( {
			rules: rules === 'enhanced' ? 'Enhanced rules' : 'Classic rules',
			gamecode: gamecodeMode === 'corrected' ? 'Corrected gamecode' : 'Installed gamecode'
		} )
	};

}

/**
 * Mounts the planned level through the engine's loaders and places the client's player.
 *
 * @param {{ entry: object, classId: string, gamecodeMode?: string, rules?: string, level?: string, client: object,
 *   loadMap: function(string): object, sv?: object, svs?: object }} options the catalogue entry, the class, the
 *   client record (its `message` receives the signon), a map loader returning the loaded brush model, and optional
 *   server state overrides
 * @returns {{ ok: true, plan: object, map: object, player: object } | { ok: false, reason: string }} the mounted
 *   level and player, or why mounting failed
 */
export function Hexen2_MountLevel( options ) {

	const plan = Hexen2_PlanStart( options.entry, options );
	if ( ! plan.ok ) return plan;
	// loose files (Hexen's gamecode) come through the platform reader when the host supplies one; pack members come
	// through the engine's mounted paks
	const readNamed = name => {

		const loose = typeof options.readFile === 'function' ? options.readFile( name ) : null;
		if ( loose ) return loose instanceof Uint8Array ? loose : new Uint8Array( loose );
		const found = COM_FindFile( name );
		if ( ! found ) return null;
		return new Uint8Array( found.data.buffer, found.data.byteOffset, found.size ).slice();

	};
	const progs = readNamed( 'progs.dat' );
	if ( ! progs ) return { ok: false, reason: 'progs.dat is not in the mounted game' };
	const paletteBytes = readNamed( 'gfx/palette.lmp' );
	if ( ! paletteBytes ) return { ok: false, reason: 'gfx/palette.lmp is not in the mounted game' };
	try { PR_LoadProgs( progs.buffer.slice( progs.byteOffset, progs.byteOffset + progs.byteLength ) ); }
	catch ( error ) { return { ok: false, reason: 'the gamecode would not load: ' + error.message }; }
	// native difficulty: gamecode reads skill while spawning the level's entities
	if ( Number.isInteger( options.skill ) ) pr_global_struct.skill = options.skill;
	VID_SetPalette( paletteBytes );
	Mod_SetHexenHullLayout( true );
	let map;
	try { map = options.loadMap( plan.startMap ); } catch ( error ) { Mod_SetHexenHullLayout( false ); return { ok: false, reason: 'the map would not load: ' + error.message }; }
	Mod_SetHexenHullLayout( false );
	if ( ! map ) return { ok: false, reason: `the map ${plan.startMap} is missing` };

	const sv = options.sv ?? serverSv, svs = options.svs ?? progsSvs;
	PR_SetSV( sv ); PR_SetSVS( svs );
	sv.worldmodel = map; sv.time = 0.1;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.signon.cursize = 0;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	SV_SetState( sv, svs, pr_global_struct );
	const serverCallbacks = { SV_Move, SV_TestEntityPosition, SV_ClearWorld, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram };
	if ( typeof options.installCallbacks === 'function' ) options.installCallbacks( serverCallbacks );
	try { Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts ); }
	catch ( error ) { return { ok: false, reason: 'the level entities would not spawn: ' + error.message }; }
	const wanted = options.startClassname ?? 'info_player_start';
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === wanted );
	const player = sv.edicts[ 1 ];
	const placed = Hexen2_SpawnPlayer( { sv, client: options.client, player, gameId: plan.session.gameId, classId: plan.classId,
		origin: start ? start.v.origin : [ 0, 0, 0 ] } );
	if ( ! placed.ok ) return placed;
	return { ok: true, plan, map, player };

}
