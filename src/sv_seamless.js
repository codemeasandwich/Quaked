// Seamless level changes: walk (or fall) out of the end of one level and carry on
// into the start of the next without an intermission, a teleport or a change of
// speed or heading.
//
// When a level starts, each of its exits that is a doorway or a pit (see
// r_levelgraph.js) is switched from the game's own trigger_changelevel to a
// crossing this module watches for.  When the player goes through, the next level
// is started the usual way (spawn parameters are kept: weapons, ammo, health...)
// and, as the player is put into it, their position, velocity and view are set
// from where they were, carried across by the crossing's transform.
//
// Single player only.  0 = off, 1 = Newer Game only (the default), 2 = always.

import { cvar_t } from './cvar.js';
import { sv, svs } from './server.js';
import { COM_FindFile, COM_ListFiles } from './pak.js';
import { Ent_Parse } from './lit.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition } from './world.js';
import { PR_GetString, EDICT_NUM, EDICT_TO_PROG, pr_global_struct } from './progs.js';
import { ED_Alloc, ED_Free, ED_Write, ED_WriteGlobals, ED_ParseGlobals, ED_ParseEdict } from './pr_edict.js';
import { COM_Parse, com_token } from './common.js';
import { Cbuf_AddText } from './cmd.js';
import { Con_DPrintf } from './common.js';
import { Cvar_VariableValue } from './cvar.js';
import { r_newer_portals } from './r_anim.js';
import { R_AddLevelRunner, R_MoveLevelRunner, R_RemoveLevelRunner, R_ClearLevelRunners } from './r_levelview.js';
import { R_TeleportFxBegin, R_TeleportFxCapture, R_TeleportFxMode, R_TeleportOverlayShown, R_TeleportFxSnap, R_TeleportFxReset } from './r_teleportfx.js';
import {
	R_ParseBsp, R_ParseEntityLump, R_LevelLinks, R_CrossingTransform, R_ChooseApproach, R_InverseCrossing
} from './r_levelgraph.js';

export const sv_seamless = new cvar_t( 'sv_seamless', '1' );

const CONTENTS_SOLID = - 2;
const SOLID_NOT = 0;
const FL_ONGROUND = 512;

const metaCache = new Map();

let crossings = []; // this level's seamless exits
let pending = null; // a crossing in progress: { map, origin, velocity, angles, pit, from }
let lastOrigin = null;
// Teleporter pads that lead to other levels: the game's own exit is taken over so the
// change is at once (no intermission), with a stretch and snap of the picture
let pads = []; // { exit, map }
let teleport = null; // { map, origin, since, phase: 'build' | 'loading' }
const TELEPORT_BUILD = 0.36; // seconds of stretching before the level changes
const TELEPORT_GIVE_UP = 8; // seconds: the level did not change

let levelStates = new Map(); // levels left through a crossing, as they were: map name -> snapshot
let holding = null; // the arrival, while the player is held until the client is ready

export function SV_SeamlessEnabled() {

	const v = sv_seamless.value;
	// r_hdr is read directly: the level is spawned in the same command batch as
	// "r_hdr 1", before any frame has been drawn with it
	// (the windows onto the next level are camera portals: no portals, no crossings)
	return v >= 2 || ( v >= 1 && Cvar_VariableValue( 'r_hdr' ) !== 0 && r_newer_portals.value !== 0 );

}

// links of a map, read straight from its BSP (cached)
export function SV_LevelLinks( mapName ) {

	if ( metaCache.has( mapName ) ) return metaCache.get( mapName );

	let links = null;
	const file = COM_FindFile( 'maps/' + mapName + '.bsp' );

	if ( file != null ) {

		const bytes = file.data != null && file.size != null
			? new Uint8Array( file.data.buffer, file.data.byteOffset, file.size )
			: file.data;
		const meta = bytes != null ? R_ParseBsp( bytes ) : null;

		if ( meta !== null ) {

			// the Newer Game pack may give the map a different entity list (maps/e1m1.ent)
			const ent = COM_FindFile( 'maps/' + mapName + '.ent' );
			const text = ent != null ? Ent_Parse( ent.data ) : null;
			if ( text !== null ) meta.entities = R_ParseEntityLump( text );

			links = R_LevelLinks( meta );

		}

	}

	metaCache.set( mapName, links );
	return links;

}

// how far you can go from p along dir (up to limit) before you hit something solid
function scan( p, dir, limit ) {

	for ( let d = 4; d <= limit; d += 4 )
		if ( solidAt( [ p[ 0 ] + dir[ 0 ] * d, p[ 1 ] + dir[ 1 ] * d, p[ 2 ] + dir[ 2 ] * d ] ) ) return d - 4;

	return limit;

}

// the size of the opening the crossing is in, as a rectangle on its plane:
// corners = centre + axisA * a + axisB * b for a in [ a0, a1 ], b in [ b0, b1 ]
function openingOf( t ) {

	const c = t.center;

	if ( t.kind === 'pit' ) {

		return {
			axisA: [ 1, 0, 0 ], axisB: [ 0, 1, 0 ],
			a0: - scan( c, [ - 1, 0, 0 ], 400 ), a1: scan( c, [ 1, 0, 0 ], 400 ),
			b0: - scan( c, [ 0, - 1, 0 ], 400 ), b1: scan( c, [ 0, 1, 0 ], 400 )
		};

	}

	const a = t.tangent;
	return {
		axisA: a, axisB: [ 0, 0, 1 ],
		a0: - scan( c, [ - a[ 0 ], - a[ 1 ], 0 ], 400 ), a1: scan( c, [ a[ 0 ], a[ 1 ], 0 ], 400 ),
		b0: - scan( c, [ 0, 0, - 1 ], 200 ), b1: scan( c, [ 0, 0, 1 ], 400 )
	};

}

function solidAt( p ) {

	return SV_PointContents( p ) === CONTENTS_SOLID;

}

// how far you can go from p along dir before you hit something solid
function clearDistance( p, dir ) {

	for ( let d = 8; d <= 640; d += 8 )
		if ( solidAt( [ p[ 0 ] + dir[ 0 ] * d, p[ 1 ] + dir[ 1 ] * d, p[ 2 ] + dir[ 2 ] * d ] ) ) return d;

	return 640;

}

// the floor under a point (the first solid below it)
function floorBelow( p ) {

	for ( let d = 0; d <= 480; d += 4 )
		if ( solidAt( [ p[ 0 ], p[ 1 ], p[ 2 ] - d ] ) ) return p[ 2 ] - d + 4;

	return p[ 2 ] - 480;

}

// The level model loader lives higher up in the import graph (importing it here
// would make a cycle), so the server hands it over: Mod_LoadForPreview, Mod_PointInLeaf
// (var, without an initialiser: it may be set before this module has finished loading)
var models;

// The renderer's links through liquid surfaces ( { above, below, aboveVis, belowVis } ),
// which the server uses to see through water (see SV_FatPVS)
var liquidLinksSource;

// The renderer's way of getting a level ready before it is entered (see r_prewarm.js)
var warmLevelHook;

export function SV_SetWarmLevel( fn ) {

	warmLevelHook = fn;

}

// how near an exit (in units) the player gets before the level behind it is got ready
const WARM_DISTANCE = 900;

export function SV_SetLiquidLinks( fn ) {

	liquidLinksSource = fn;

}

export function SV_LiquidLinks() {

	return liquidLinksSource ? liquidLinksSource() : [];

}

// The entities of a level you have been in, as you left them ({ classname, origin,
// model, frame ... } each), for drawing it from another level; null if not visited.
export function SV_LevelSnapshotEntities( mapName ) {

	const snap = levelStates.get( mapName );
	if ( snap === undefined ) return null;
	return R_ParseEntityLump( snap.edicts.join( '\n' ) );

}

export function SV_SeamlessUseModels( tools ) {

	models = tools;

}

// how much wall to leave behind the plane where you arrive: the player's hull
// is 16 to a side, and the doorway back must be somewhere they can reach
const BACK_MARGIN = 20;

// the doorway back is drawn this far in front of the wall it is in, so it sits in
// the wall rather than floating in the room
const WINDOW_GAP = 2;
const BACK_LOOK = 128;

/*
================
SV_ArrivalStart

Where the exit plane lands in the level it leads to.  The start's own spot is
usually a step or two from the wall behind it; the way back (the window onto the
level you came from) goes on that wall, so the plane is put just in front of it.
================
*/
function SV_ArrivalStart( mapName, start ) {

	if ( ! models ) return start;

	const model = models.Mod_LoadForPreview( 'maps/' + mapName + '.bsp' );
	if ( model == null || model.leafs == null ) return start;

	const rad = start.yaw * Math.PI / 180;
	const dir = [ Math.cos( rad ), Math.sin( rad ) ];

	let back = BACK_LOOK;
	for ( let d = 4; d <= BACK_LOOK; d += 4 ) {

		const leaf = models.Mod_PointInLeaf( [ start.origin[ 0 ] - dir[ 0 ] * d, start.origin[ 1 ] - dir[ 1 ] * d, start.origin[ 2 ] ], model );
		if ( leaf.contents === CONTENTS_SOLID ) {

			back = d - 4;
			break;

		}

	}

	const shift = Math.max( 0, back - BACK_MARGIN );
	return {
		origin: [ start.origin[ 0 ] - dir[ 0 ] * shift, start.origin[ 1 ] - dir[ 1 ] * shift, start.origin[ 2 ] ],
		yaw: start.yaw
	};

}

//============================================================================
// Levels keep their state
//============================================================================
//
// A level left through a crossing is written out the way a savegame writes it
// (the game's globals and every entity but the players), and when the player
// comes back it is read back over the freshly loaded level: dead monsters stay
// dead where they fell, dropped weapons and picked-up items stay as they were,
// doors stay open.  The states last for as long as the player only moves between
// levels by crossings; starting a game or any other level change forgets them.

function SV_CaptureLevel() {

	const first = svs.maxclients + 1;
	const globals = [];
	ED_WriteGlobals( globals );

	const edicts = [];
	for ( let i = first; i < sv.num_edicts; i ++ ) {

		const lines = [];
		ED_Write( lines, EDICT_NUM( i ) );
		edicts.push( lines.join( '\n' ) );

	}

	return { first, time: sv.time, lightstyles: sv.lightstyles.slice(), globals: globals.join( '\n' ), edicts };

}

// the text of one { ... } block, ready for the parsers (which start after the brace)
function blockData( text ) {

	const data = COM_Parse( text );
	return com_token === '{' ? data : null;

}

function SV_RestoreLevel( snap ) {

	// what the level's own entities just spawned is replaced by what was there
	for ( let i = snap.first; i < sv.num_edicts; i ++ ) {

		const ed = EDICT_NUM( i );
		if ( ed.free === false ) ED_Free( ed );

	}

	const globals = blockData( snap.globals );
	if ( globals !== null ) ED_ParseGlobals( globals );

	snap.edicts.forEach( ( text, k ) => {

		const ed = EDICT_NUM( snap.first + k );
		const data = blockData( text );
		if ( data === null ) return;

		ed.free = false;
		ED_ParseEdict( data, ed );
		if ( ed.free === false ) SV_LinkEdict( ed, false );

	} );

	sv.num_edicts = snap.first + snap.edicts.length;
	sv.time = snap.time;

	for ( let i = 0; i < snap.lightstyles.length; i ++ ) sv.lightstyles[ i ] = snap.lightstyles[ i ];

	// these belong to the game in progress, not to the level's old state
	pr_global_struct.serverflags = svs.serverflags;
	pr_global_struct.time = sv.time;

}


//============================================================================
// Monsters that give chase follow through the crossing
//============================================================================
//
// Whatever is hunting the player close behind them when they cross is taken out of the
// level they leave and comes through the doorway after them, a little behind, at about
// the pace they were keeping.  (A monster whose model the next level has not loaded
// cannot be shown there, and stays behind.)

const FOLLOW_RANGE = 700;
const FOLLOW_MAX = 6;
const FOLLOW_SPEED = 200;
const FOLLOW_STAGGER = 0.3;
const FOLLOW_GIVE_UP = 3;
const NO_FOLLOW = /^monster_(boss|oldone|shalrath_gate|fish|tarbaby_spawner)$/;
let arrivals = null;

function SV_TakeFollowers( player, cur, t ) {

	if ( t.kind === 'pit' ) return [];

	const me = EDICT_TO_PROG( player );
	const found = [];

	for ( let i = svs.maxclients + 1; i < sv.num_edicts; i ++ ) {

		const ed = EDICT_NUM( i );
		if ( ed.free ) continue;

		const cls = PR_GetString( ed.v.classname );
		if ( cls.indexOf( 'monster_' ) !== 0 || NO_FOLLOW.test( cls ) ) continue;
		if ( ! ( ed.v.health > 0 ) || ed.v.takedamage === 0 || ed.v.enemy !== me ) continue;
		if ( ( ed.v.flags | 0 ) & 2 ) continue; // FL_SWIM

		const rel = [ ed.v.origin[ 0 ] - cur[ 0 ], ed.v.origin[ 1 ] - cur[ 1 ], ed.v.origin[ 2 ] - cur[ 2 ] ];
		const dist = Math.hypot( rel[ 0 ], rel[ 1 ], rel[ 2 ] );
		if ( dist <= FOLLOW_RANGE ) found.push( { ed, rel, dist } );

	}

	found.sort( ( a, b ) => a.dist - b.dist );
	const list = [];

	for ( const f of found.slice( 0, FOLLOW_MAX ) ) {

		const lines = [];
		ED_Write( lines, f.ed );
		const text = lines.join( '\n' );
		const o = f.ed.v.origin;

		// its run: straight to the doorway, to the spot across from the player that it was off to the side by
		const side = t.tangent;
		const lat = Math.max( - 56, Math.min( 56, f.rel[ 0 ] * side[ 0 ] + f.rel[ 1 ] * side[ 1 ] ) );
		const from = [ o[ 0 ], o[ 1 ], o[ 2 ] ];
		const to = [ cur[ 0 ] + side[ 0 ] * lat, cur[ 1 ] + side[ 1 ] * lat, o[ 2 ] ];
		const run = Math.hypot( to[ 0 ] - from[ 0 ], to[ 1 ] - from[ 1 ] );
		const earliest = list.length > 0 ? list[ list.length - 1 ].delay + FOLLOW_STAGGER : 0;

		list.push( {
			text, from, to, run,
			delay: Math.max( run / FOLLOW_SPEED, earliest ),
			heading: Math.atan2( to[ 1 ] - from[ 1 ], to[ 0 ] - from[ 0 ] ) * 180 / Math.PI,
			model: ( /"model"\s+"([^"]+)"/.exec( text ) || [ '', '' ] )[ 1 ],
			skin: parseInt( ( /"skin"\s+"(\d+)"/.exec( text ) || [ '', '0' ] )[ 1 ], 10 ),
			classname: PR_GetString( f.ed.v.classname )
		} );
		ED_Free( f.ed );

	}

	// they are no longer this level's to kill
	pr_global_struct.total_monsters -= list.length;
	return list;

}


// A monster coming through from another level may be one this level never loaded: its model and
// its sounds are added to the level while it is still loading (nothing can be added later).
function SV_PrecacheFollowers( followers ) {

	if ( sv.model_precache == null || sv.sound_precache == null ) return;

	const add = ( list, name ) => {

		for ( let i = 0; i < 256 && i < list.length; i ++ ) {

			if ( list[ i ] == null ) {

				list[ i ] = name;
				return true;

			}

			if ( list[ i ] === name ) return false;

		}

		return false;

	};

	for ( const f of followers ) {

		const m = /"model"\s+"([^"]+)"/.exec( f.text );
		if ( m === null ) continue;

		if ( add( sv.model_precache, m[ 1 ] ) ) {

			const i = sv.model_precache.indexOf( m[ 1 ] );
			sv.models[ i ] = models != null && models.Mod_ForName ? models.Mod_ForName( m[ 1 ], true ) : null;

		}

		// the monster's sounds: everything in the folder named after it (soldier/, knight/ ...)
		const dir = /^progs\/([a-z]+)/.exec( m[ 1 ] );
		if ( dir === null ) continue;
		for ( const file of COM_ListFiles( 'sound/' + dir[ 1 ] + '/' ) ) {

			add( sv.sound_precache, file.substring( 6 ) );

		}

	}

}


// The player goes back through the doorway before the followers have all come through: the ones still
// running are put back in the level they were running in, where they had got to.
function SV_ReturnFollowers( map ) {

	const a = arrivals;
	arrivals = null;
	if ( a === null ) return;

	const snap = levelStates.get( map );
	let n = 0;

	for ( const f of a.list ) {

		if ( f.runner !== null ) {

			R_RemoveLevelRunner( f.runner );
			f.runner = null;

		}

		if ( f.placed || snap === undefined || a.from !== map ) continue;

		const k = f.delay > 0 ? Math.min( 1, ( sv.time - a.at ) / f.delay ) : 1;
		const at = [ f.from[ 0 ] + ( f.to[ 0 ] - f.from[ 0 ] ) * k, f.from[ 1 ] + ( f.to[ 1 ] - f.from[ 1 ] ) * k, f.from[ 2 ] ];
		snap.edicts.push( f.text.replace( /"origin"\s+"[^"]*"/, '"origin" "' + at.join( ' ' ) + '"' ) );
		n ++;

	}

	if ( n > 0 ) snap.globals = snap.globals.replace( /("total_monsters"\s+")([^"]*)(")/, ( m, x, v, y ) => x + ( ( parseFloat( v ) || 0 ) + n ) + y );

}

// in the new level: the followers are lined up to come through
function SV_QueueFollowers( arrival ) {

	arrivals = null;
	if ( arrival.followers === undefined || arrival.followers.length === 0 ) return;

	arrivals = { at: sv.time, t: arrival.transform, from: arrival.fromMap, list: arrival.followers.map( ( f ) => ( { ...f, placed: false, tries: 0, runner: null } ) ) };

	// until it gets here, each is seen through the doorway, running for it
	for ( const f of arrivals.list ) f.runner = R_AddLevelRunner( arrival.fromMap, f.model, f.skin, f.classname, f.from, f.heading );

}

function SV_ModelIndex( name ) {

	if ( sv.model_precache == null ) return - 1;
	for ( let i = 0; i < sv.model_precache.length; i ++ ) {

		if ( sv.model_precache[ i ] == null ) break;
		if ( sv.model_precache[ i ] === name ) return i;

	}

	return - 1;

}

function SV_PlaceFollowers( player ) {

	const a = arrivals;
	if ( a === null ) return;

	const t = a.t;
	const fwd = t.direction( t.through ); // the way on, in this level
	let waiting = 0;

	for ( const f of a.list ) {

		if ( f.placed ) continue;
		const age = sv.time - a.at;
		if ( age < f.delay ) {

			// still on the run, on the other side
			if ( f.runner !== null ) {

				const k = f.delay > 0 ? age / f.delay : 1;
				R_MoveLevelRunner( f.runner, [ f.from[ 0 ] + ( f.to[ 0 ] - f.from[ 0 ] ) * k, f.from[ 1 ] + ( f.to[ 1 ] - f.from[ 1 ] ) * k, f.from[ 2 ] ], f.heading );

			}

			waiting ++;
			continue;

		}

		if ( f.runner !== null ) {

			R_RemoveLevelRunner( f.runner );
			f.runner = null;

		}

		const data = blockData( f.text );
		if ( data === null ) {

			f.placed = true;
			continue;

		}

		const ed = ED_Alloc();
		ED_ParseEdict( data, ed );

		const index = SV_ModelIndex( PR_GetString( ed.v.model ) );
		if ( index < 0 ) {

			// this level has not loaded that monster
			ED_Free( ed );
			f.placed = true;
			continue;

		}

		// where the run ends: at the doorway, stepping out of it
		const at = t.position( f.to );
		const base = [ at[ 0 ] + fwd[ 0 ] * 4, at[ 1 ] + fwd[ 1 ] * 4, at[ 2 ] ];
		const yaw = t.angle( f.heading );

		ed.v.modelindex = index;
		ed.v.enemy = EDICT_TO_PROG( player );
		ed.v.goalentity = ed.v.enemy;
		ed.v.oldenemy = 0;
		ed.v.movetarget = 0;
		ed.v.owner = 0;
		ed.v.chain = 0;
		ed.v.nextthink = sv.time + 0.1;
		ed.v.attack_finished = 0;
		ed.v.pain_finished = 0;
		ed.v.search_time = 0;
		ed.v.velocity = [ 0, 0, 0 ];
		ed.v.angles = [ 0, yaw, 0 ];
		ed.v.ideal_yaw = yaw;
		ed.v.flags = ( ed.v.flags | 0 ) & ~ 512; // not on the ground until it is found to be

		// the first free spot on from the doorway
		let ok = false;
		for ( let d = 0; d <= 96 && ok === false; d += 8 ) {

			for ( const dz of [ 0, 8, 16, 32 ] ) {

				ed.v.origin = [ base[ 0 ] + fwd[ 0 ] * d, base[ 1 ] + fwd[ 1 ] * d, base[ 2 ] + dz ];
				if ( SV_TestEntityPosition( ed ) === null ) {

					ok = true;
					break;

				}

			}

		}

		if ( ok === false ) {

			// the way is blocked for now: try again in a moment
			ED_Free( ed );
			if ( ++ f.tries * 0.1 < FOLLOW_GIVE_UP ) {

				waiting ++;
				continue;

			}

			f.placed = true;
			continue;

		}

		ed.v.oldorigin = [ ed.v.origin[ 0 ], ed.v.origin[ 1 ], ed.v.origin[ 2 ] ];
		SV_LinkEdict( ed, false );
		pr_global_struct.total_monsters += 1;
		f.placed = true;

	}

	if ( waiting === 0 ) {

		arrivals = null;
		R_ClearLevelRunners();

	}

}

//============================================================================
// Archways: the crossing is at the arch, not at the end of the tunnel
//============================================================================

const TUNNEL_MAX = 160; // how far back to look for where the passage opens out
const ARCH_THICK = 32; // an exit brush this thin is an archway (a fatter one is a portal)

// how far from the exit's plane, back the way the player comes, the passage
// stays narrow: the tunnel between the arch and the trigger at the end of it
function SV_TunnelDepth( t ) {

	const ap = [ - t.through[ 0 ], - t.through[ 1 ], 0 ];
	const tg = [ t.tangent[ 0 ], t.tangent[ 1 ], 0 ];
	const back = [ - tg[ 0 ], - tg[ 1 ], 0 ];
	let narrow = Infinity;

	for ( let d = 0; d <= TUNNEL_MAX; d += 4 ) {

		const p = [ t.center[ 0 ] + ap[ 0 ] * d, t.center[ 1 ] + ap[ 1 ] * d, t.center[ 2 ] ];
		const width = scan( p, tg, 400 ) + scan( p, back, 400 );

		if ( width < narrow ) narrow = width;
		else if ( width > narrow * 1.35 + 16 ) return Math.max( 0, d - 4 );

	}

	return 0;

}

// doors between the arch and the trigger; a locked one (needs a key) is a reason to leave the crossing where it is
function SV_DoorsInTunnel( exit, shifted ) {

	const found = [];
	let locked = false;

	for ( let i = svs.maxclients + 1; i < sv.num_edicts; i ++ ) {

		const ed = sv.edicts[ i ];
		if ( ed.free ) continue;
		const name = PR_GetString( ed.v.classname );
		if ( name !== 'door' && name !== 'func_door' ) continue;

		// the stretch from the arch to the far side of the trigger
		let across = true;
		for ( let a = 0; a < 3; a ++ ) {

			const lo = Math.min( exit.mins[ a ], shifted.mins[ a ] ) - 4;
			const hi = Math.max( exit.maxs[ a ], shifted.maxs[ a ] ) + 4;
			if ( ed.v.absmax[ a ] < lo || ed.v.absmin[ a ] > hi ) across = false;

		}

		if ( across === false ) continue;
		if ( ( ed.v.items | 0 ) !== 0 ) locked = true;
		found.push( ed );

	}

	return locked ? null : found;

}

// doors across an exit's opening (a key door in front of the way out)
function SV_ClearExitDoors( exit ) {

	const pad = 96;

	for ( let i = 1; i < sv.num_edicts; i ++ ) {

		const ed = sv.edicts[ i ];
		if ( ed.free ) continue;

		const name = PR_GetString( ed.v.classname );
		if ( name !== 'door' && name !== 'func_door' && name !== 'func_door_secret' ) continue;

		let across = true;
		for ( let a = 0; a < 3; a ++ )
			if ( ed.v.absmax[ a ] < exit.mins[ a ] - pad || ed.v.absmin[ a ] > exit.maxs[ a ] + pad ) across = false;

		if ( across ) ED_Free( ed );

	}

}

/*
================
SV_SeamlessSetup

Called once a level's entities are loaded.
================
*/
// Something to walk back through: a doorway, archway, portal or door in this level
// where the way back would be.  Without it the way back would lead out of nowhere,
// so the player who arrives is not offered one.
const RETURN_MARKER = /^[aew]?door|^dr\d|^[w]?enter|^z?_?exit|arch|^window|^gate|^portc/; // (a teleporter is not one: see SV_ExitIsTeleporter)
const RETURN_REACH = 224; // how far from the way back a marker may be

function SV_HasReturnMarker( inverse ) {

	const model = sv.worldmodel;
	if ( model == null || model.surfaces == null ) return false;

	const c = inverse.center;

	for ( const surf of model.surfaces ) {

		if ( surf.texinfo == null || surf.texinfo.texture == null ) continue;
		if ( ! RETURN_MARKER.test( surf.texinfo.texture.name ) ) continue;

		const mn = [ 1e9, 1e9, 1e9 ], mx = [ - 1e9, - 1e9, - 1e9 ];
		for ( let i = 0; i < surf.numedges; i ++ ) {

			const l = model.surfedges[ surf.firstedge + i ];
			const e = l > 0 ? model.edges[ l ] : model.edges[ - l ];
			const v = model.vertexes[ l > 0 ? e.v[ 0 ] : e.v[ 1 ] ].position;
			for ( let a = 0; a < 3; a ++ ) {

				mn[ a ] = Math.min( mn[ a ], v[ a ] );
				mx[ a ] = Math.max( mx[ a ], v[ a ] );

			}

		}

		if ( mx[ 0 ] < c[ 0 ] - RETURN_REACH || mn[ 0 ] > c[ 0 ] + RETURN_REACH ) continue;
		if ( mx[ 1 ] < c[ 1 ] - RETURN_REACH || mn[ 1 ] > c[ 1 ] + RETURN_REACH ) continue;
		if ( mx[ 2 ] < c[ 2 ] - 64 || mn[ 2 ] > c[ 2 ] + 160 ) continue;

		return true;

	}

	return false;

}

// An exit with a teleporter machine at it (the swirling *teleport pictures, or a
// slipgate: the slip textures) is a teleporter, whatever its shape: a pad that leads
// to another level, not a doorway.
const TELEPORTER_TEXTURE = /^(\*teleport|(\+.)?slip)/i;

function SV_ExitIsTeleporter( exit ) {

	const model = sv.worldmodel;
	if ( model == null || model.surfaces == null ) return false;

	const reach = 48;

	for ( const surf of model.surfaces ) {

		if ( surf.texinfo == null || surf.texinfo.texture == null ) continue;
		if ( ! TELEPORTER_TEXTURE.test( surf.texinfo.texture.name ) ) continue;

		let near = true;
		const mn = [ 1e9, 1e9, 1e9 ], mx = [ - 1e9, - 1e9, - 1e9 ];
		for ( let i = 0; i < surf.numedges; i ++ ) {

			const l = model.surfedges[ surf.firstedge + i ];
			const e = l > 0 ? model.edges[ l ] : model.edges[ - l ];
			const v = model.vertexes[ l > 0 ? e.v[ 0 ] : e.v[ 1 ] ].position;
			for ( let a = 0; a < 3; a ++ ) {

				mn[ a ] = Math.min( mn[ a ], v[ a ] );
				mx[ a ] = Math.max( mx[ a ], v[ a ] );

			}

		}

		for ( let a = 0; a < 3; a ++ )
			if ( mx[ a ] < exit.mins[ a ] - reach || mn[ a ] > exit.maxs[ a ] + reach ) near = false;

		if ( near ) return true;

	}

	return false;

}

// stop the game's own exit from firing; whoever asks takes over.  Triggers clear
// their model name when they spawn, so this one is found by its box: the game makes
// it one unit bigger than the brush all round.
function takeExit( exit ) {

	let taken = false;
	for ( let i = 0; i < sv.num_edicts; i ++ ) {

		const ed = sv.edicts[ i ];
		if ( ed.free ) continue;
		if ( PR_GetString( ed.v.classname ) !== 'trigger_changelevel' ) continue;

		let same = true;
		for ( let a = 0; a < 3; a ++ )
			if ( Math.abs( ed.v.mins[ a ] - exit.mins[ a ] ) > 2 || Math.abs( ed.v.maxs[ a ] - exit.maxs[ a ] ) > 2 ) same = false;
		if ( same === false ) continue;

		ed.v.solid = SOLID_NOT;
		SV_LinkEdict( ed, false );
		taken = true;

	}

	return taken;

}

export function SV_SeamlessSetup() {

	crossings = [];
	pads = [];

	// a teleporter pad has sent us here: the picture snaps back now
	if ( teleport !== null ) {

		if ( teleport.phase === 'loading' && teleport.map === sv.name ) R_TeleportFxSnap();
		else R_TeleportFxReset(); // some other level change: no teleport
		teleport = null;

	}
	lastOrigin = null;

	// only crossings carry a level's state along; anything else starts afresh
	const arriving = pending !== null && pending.map === sv.name;
	if ( arriving === false ) levelStates.clear();

	if ( ! SV_SeamlessEnabled() || svs.maxclients !== 1 || sv.worldmodel == null ) return;

	const here = SV_LevelLinks( sv.name );
	if ( here === null ) return;

	if ( arriving && pending.followers !== undefined ) SV_PrecacheFollowers( pending.followers );

	// a level we have been in: as we left it
	const state = arriving ? levelStates.get( sv.name ) : undefined;
	if ( state !== undefined ) SV_RestoreLevel( state );

	// the doorway we came in by, seen from this side: a way back
	const from = pending !== null && pending.map === sv.name ? pending.from : null;
	if ( from != null ) {

		const inverse = R_InverseCrossing( from.transform, from.opening );
		if ( inverse !== null && SV_HasReturnMarker( inverse ) ) {

			const o = from.opening;
			crossings.push( {
				exit: null, map: from.map, transform: inverse, side: 0, back: true,
				opening: {
					axisA: inverse.tangent, axisB: [ 0, 0, 1 ], a0: o.a0, a1: o.a1, b0: o.b0, b1: o.b1,
					// drawn in the wall behind the plane, not on it
					shift: [ inverse.through[ 0 ] * ( BACK_MARGIN - WINDOW_GAP ), inverse.through[ 1 ] * ( BACK_MARGIN - WINDOW_GAP ), 0 ]
				}
			} );

		}

	}

	for ( const exit of here.exits ) {

		if ( exit.kind === 'pad' || SV_ExitIsTeleporter( exit ) ) {

			// a teleporter pad: it stays a pad, and the teleport is at once
			if ( SV_LevelLinks( exit.map ) !== null && takeExit( exit ) ) pads.push( { exit, map: exit.map } );
			continue;

		}

		const there = SV_LevelLinks( exit.map );
		if ( there === null || there.start === null ) continue; // not available: leave it to the game

		const centre = [
			( exit.mins[ 0 ] + exit.maxs[ 0 ] ) * 0.5,
			( exit.mins[ 1 ] + exit.maxs[ 1 ] ) * 0.5,
			( exit.mins[ 2 ] + exit.maxs[ 2 ] ) * 0.5
		];

		const approach = R_ChooseApproach( exit, clearDistance );
		const side = approach.side;
		const arrival = exit.kind === 'pit' ? there.start : SV_ArrivalStart( exit.map, there.start );
		let transform = R_CrossingTransform( exit, side, arrival, floorBelow( centre ), approach.axis );
		let openDoors = [];

		// An archway: cross at the arch itself.  The tunnel behind it is never
		// walked (the window sits where the arch is and hides it), and any door
		// that was in the way is gone.  A key door stays and the crossing stays
		// behind it.
		if ( transform !== null && exit.kind === 'plane' && Math.min( exit.maxs[ 0 ] - exit.mins[ 0 ], exit.maxs[ 1 ] - exit.mins[ 1 ] ) <= ARCH_THICK ) {

			const depth = SV_TunnelDepth( transform );
			if ( depth > 4 ) {

				const ap = [ - transform.through[ 0 ] * depth, - transform.through[ 1 ] * depth, 0 ];
				const moved = {
					mins: [ exit.mins[ 0 ] + ap[ 0 ], exit.mins[ 1 ] + ap[ 1 ], exit.mins[ 2 ] ],
					maxs: [ exit.maxs[ 0 ] + ap[ 0 ], exit.maxs[ 1 ] + ap[ 1 ], exit.maxs[ 2 ] ]
				};

				const doors = SV_DoorsInTunnel( exit, moved );
				if ( doors !== null ) {

					transform = R_CrossingTransform( moved, side, arrival, floorBelow( centre ), approach.axis );
					openDoors = doors;

				}

			}

		}

		if ( transform === null ) continue;

		// stop the game's own exit from firing; this crossing takes over
		const taken = takeExit( exit );

		// coming back through this exit from the other side: whatever was locked
		// across it (a key door) has been dealt with and is gone
		if ( taken && pending !== null && pending.map === sv.name && pending.viaBack === true )
			SV_ClearExitDoors( exit );

		if ( taken ) {

			for ( const door of openDoors ) ED_Free( door );
			crossings.push( { exit, map: exit.map, transform, side, opening: openingOf( transform ) } );

		}

	}

	if ( crossings.length > 0 )
		Con_DPrintf( 'seamless: %d exit(s) on %s\n', crossings.length, sv.name );

}

/*
================
SV_SeamlessFrame

After the physics each frame: has the player gone through an exit?
================
*/
export function SV_SeamlessFrame() {

	if ( pending !== null ) return;
	if ( crossings.length === 0 && pads.length === 0 && teleport === null && arrivals === null ) return;

	const client = svs.clients[ 0 ];
	if ( client == null || client.edict == null ) return;

	const ent = client.edict;

	if ( arrivals !== null && holding === null ) SV_PlaceFollowers( ent );

	// near an exit: the level behind it is got ready now, a little each frame
	if ( warmLevelHook !== undefined && teleport === null ) SV_WarmNearExits( ent );

	if ( SV_TeleporterPads( ent ) ) return;
	if ( crossings.length === 0 ) return;

	const cur = [ ent.v.origin[ 0 ], ent.v.origin[ 1 ], ent.v.origin[ 2 ] ];

	if ( lastOrigin !== null ) {

		for ( const c of crossings ) {

			if ( c.transform.crossed( lastOrigin, cur ) === false ) continue;

			const t = c.transform;
			const va = ent.v.v_angle;

			// (followers still on their way back through the other way go back to where they were)
			SV_ReturnFollowers( c.map );

			// whatever is chasing the player comes too
			const followers = SV_TakeFollowers( ent, cur, t );

			// the level is left as it is: monsters, items, doors...
			levelStates.set( sv.name, SV_CaptureLevel() );

			pending = {
				map: c.map,
				index: crossings.indexOf( c ),
				pit: t.kind === 'pit',
				viaBack: c.back === true,
				followers,
				fromMap: sv.name,
				transform: t,
				origin: t.position( cur ),
				velocity: t.direction( [ ent.v.velocity[ 0 ], ent.v.velocity[ 1 ], ent.v.velocity[ 2 ] ] ),
				angles: [ va[ 0 ], t.angle( va[ 1 ] ), 0 ],
				// the doorway just used, for the way back from the other side (going
				// back through a way back leads to a level that already has this exit)
				from: c.back === true || t.kind !== 'plane' ? null : { map: sv.name, transform: t, opening: c.opening }
			};

			Cbuf_AddText( 'changelevel ' + c.map + '\n' );
			return;

		}

	}

	lastOrigin = cur;

}

function SV_WarmNearExits( ent ) {

	const o = ent.v.origin;
	const near = ( c ) => {

		const dx = o[ 0 ] - c[ 0 ], dy = o[ 1 ] - c[ 1 ], dz = o[ 2 ] - c[ 2 ];
		return dx * dx + dy * dy + dz * dz < WARM_DISTANCE * WARM_DISTANCE;

	};

	for ( const c of crossings ) if ( near( c.transform.center ) ) warmLevelHook( c.map );

	for ( const p of pads ) {

		const m = p.exit;
		if ( near( [ ( m.mins[ 0 ] + m.maxs[ 0 ] ) / 2, ( m.mins[ 1 ] + m.maxs[ 1 ] ) / 2, ( m.mins[ 2 ] + m.maxs[ 2 ] ) / 2 ] ) ) warmLevelHook( p.map );

	}

}

/*
================
SV_TeleporterPads

The player on a pad that leads to another level: the picture stretches while they
stand held where they are, then the level changes with no intermission and no
loading screen, and the picture snaps back in the new level.  Returns true while
a teleport is under way.
================
*/
function SV_TeleporterPads( ent ) {

	const now = performance.now() / 1000;

	if ( teleport === null ) {

		if ( pads.length === 0 || ent.v.health <= 0 ) return false;

		for ( const p of pads ) {

			let inside = true;
			for ( let a = 0; a < 3; a ++ )
				if ( ent.v.absmax[ a ] < p.exit.mins[ a ] || ent.v.absmin[ a ] > p.exit.maxs[ a ] ) inside = false;
			if ( inside === false ) continue;

			// the picture the player sees is copied at the end of this frame, and stretched
			// (by the browser, so it keeps moving) while the next level loads behind it
			teleport = { map: p.map, origin: [ ent.v.origin[ 0 ], ent.v.origin[ 1 ], ent.v.origin[ 2 ] ], since: now, phase: 'capture', frames: 0 };
			if ( typeof document !== 'undefined' ) R_TeleportFxCapture();
			else { teleport.phase = 'build'; R_TeleportFxBegin( now ); }
			return true;

		}

		return false;

	}

	// held where they stepped, in the air if need be
	ent.v.velocity = [ 0, 0, 0 ];
	ent.v.origin = [ teleport.origin[ 0 ], teleport.origin[ 1 ], teleport.origin[ 2 ] ];
	SV_LinkEdict( ent, false );

	if ( teleport.phase === 'capture' ) {

		// the copy is made when the frame has been drawn: is it up?
		teleport.frames ++;
		if ( R_TeleportOverlayShown() ) { teleport.phase = 'shown'; teleport.frames = 0; }
		else if ( R_TeleportFxMode() === 'build' ) teleport.phase = 'build'; // it could not be copied: the live picture stretches
		else if ( teleport.frames > 30 ) { teleport = null; R_TeleportFxReset(); return false; }

	} else if ( teleport.phase === 'shown' ) {

		// the copy has been on the screen for a moment: load the level behind it
		if ( ++ teleport.frames >= 2 ) {

			teleport.phase = 'loading';
			teleport.since = now;
			Cbuf_AddText( 'changelevel ' + teleport.map + '\n' );

		}

	} else if ( teleport.phase === 'build' && now - teleport.since >= TELEPORT_BUILD ) {

		teleport.phase = 'loading';
		teleport.since = now;
		Cbuf_AddText( 'changelevel ' + teleport.map + '\n' );

	} else if ( teleport.phase === 'loading' && now - teleport.since > TELEPORT_GIVE_UP ) {

		// the level never came: let go
		teleport = null;
		R_TeleportFxReset();

	}

	return true;

}

/*
================
SV_SeamlessPlacePlayer

Called right after the game has put the player in the new level.
================
*/
export function SV_SeamlessPlacePlayer( ent ) {

	const arrival = pending;
	pending = null;
	lastOrigin = null;
	arrivals = null;

	if ( arrival === null || arrival.map !== sv.name ) return;
	SV_QueueFollowers( arrival );

	const start = [ ent.v.origin[ 0 ], ent.v.origin[ 1 ], ent.v.origin[ 2 ] ];
	ent.v.origin = arrival.origin;

	// carried into a wall (a wide doorway into a narrow room, or a floor a step
	// higher): the nearest free spot on ahead of them (the way they are going), then up; the start
	// only if there is none
	if ( SV_TestEntityPosition( ent ) !== null ) {

		const carried = arrival.origin;
		const v = arrival.velocity;
		const speed = Math.sqrt( v[ 0 ] * v[ 0 ] + v[ 1 ] * v[ 1 ] );
		const yaw = arrival.angles[ 1 ] * Math.PI / 180;
		const dir = speed > 1 ? [ v[ 0 ] / speed, v[ 1 ] / speed ] : [ Math.cos( yaw ), Math.sin( yaw ) ];
		let found = false;

		for ( let d = 0; d <= 112 && found === false; d += 8 ) {

			for ( const dz of [ 0, 8, 16, 24, 32, 40 ] ) {

				ent.v.origin = [ carried[ 0 ] + dir[ 0 ] * d, carried[ 1 ] + dir[ 1 ] * d, carried[ 2 ] + dz ];
				if ( SV_TestEntityPosition( ent ) === null ) {

					found = true;
					break;

				}

			}

		}

		if ( found === false ) ent.v.origin = start;

	}

	ent.v.oldorigin = [ ent.v.origin[ 0 ], ent.v.origin[ 1 ], ent.v.origin[ 2 ] ];
	ent.v.velocity = arrival.velocity;
	holding = arrival; // frozen here until the client has finished loading
	ent.v.angles = arrival.angles;
	ent.v.v_angle = arrival.angles;
	ent.v.fixangle = 1;

	if ( arrival.pit ) ent.v.flags = ( ent.v.flags | 0 ) & ~ FL_ONGROUND;

	SV_LinkEdict( ent, false );

}

/*
================
SV_SeamlessHolding

While the client is still loading the new level the player is held where they
arrived, so gravity and friction do not eat the speed they came in with.
================
*/
export function SV_SeamlessHolding( num ) {

	if ( holding === null ) return false;

	const client = svs.clients[ num - 1 ];
	if ( client != null && client.spawned === true ) {

		// the client is ready: let go, moving exactly as they were
		const ent = client.edict;
		ent.v.velocity = holding.velocity;
		holding = null;
		return false;

	}

	return true;

}

export function SV_SeamlessCrossingCount() {

	return crossings.length;

}

export function SV_SeamlessPending() {

	return pending;

}

export function SV_SeamlessReset() {

	crossings = [];
	pads = [];
	teleport = null;
	R_TeleportFxReset();
	pending = null;
	holding = null;
	arrivals = null;
	R_ClearLevelRunners();
	lastOrigin = null;
	metaCache.clear();
	levelStates.clear();

}

export function SV_SeamlessCrossings() {

	return crossings;

}
