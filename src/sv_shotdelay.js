// A shotgun's damage arrives with its pellets (owner direction, 8 Oct 2026).
//
// In stock Quake a shotgun is hitscan: FireBullets traces every pellet and TraceAttack applies the damage and
// the blood or puff in the same instant. With the supplied pellets drawn (r_shotgun.js) the picture arrived
// visibly after the hit it belonged to: a player looking at a soldier saw himself hit, and the pellets that hit
// him a moment later. So, in the same single-player Newer Game where the pellets are drawn, each pellet's
// TraceAttack waits for the time its pellet takes to fly to where the game's own ray stopped, then runs, like
// a nail or a rocket landing. Everything else about the shot is the game's: the rays, the spread, the random
// numbers drawn for them, the ammunition and the firing cadence are unchanged; only the moment TraceAttack
// runs moves.
//
// How. sv_faceevents.js sees TraceAttack called by FireBullets while a blast is being observed, hands the
// call to shotDelayCapture (which snapshots everything TraceAttack reads: its two arguments, trace_ent,
// trace_endpos, trace_plane_normal, v_up, v_right and self) and has the interpreter run SUB_Null instead.
// SV_ShotDelayRun, at the start of every server frame, runs the pellets that have arrived: with the saved
// globals restored it calls the real TraceAttack, between ClearMultiDamage and ApplyMultiDamage like
// FireBullets does, and pellets of one blast that arrive at the same target in the same frame add up before
// ApplyMultiDamage, as they did in one hitscan blast. The game's own QuakeC does the damage, the blood and
// the puffs, so armour, pain, kills and credit behave as they always did; they happen later.
//
// The wait is the pellet's flight (shotgun_flight.js: the same function the picture draws), so what is seen
// and what hurts agree. `sv_shotdelay 0` restores the instant hitscan; the delay exists only where the
// pellets are drawn (a real local single-player Newer Game), never in Classic Quake, demos, multiplayer or a
// remote server.
//
// Grouping. A blast is applied to each damageable target once, when the last of that blast's pellets at that
// target has landed: stock Quake's one ApplyMultiDamage per target, so armour rounds once, a monster rolls
// for pain once and the pain functions see the blast's total (a zombie ignores a single call under 9). That
// can be up to about 50 ms (at 1,000 units) after the first of those pellets, which is the price of not
// splitting a blast. Pellets that hit the world are puffs and each lands at its own time.
//
// Effects of landing later, all stock-QuakeC behaviour evaluated at the landing: a Quad or Pentagram running
// out or being picked up while the pellets fly changes the damage; a pellet that finds its target already dead
// becomes a puff; a kill can be counted just after an intermission begins. A pellet whose target or shooter
// was removed in flight (the edict freed, even if its slot was reused) does nothing, and pellets in flight
// when the world changes (new map, loaded game, seamless level change) are dropped, never landing in the next
// one. They are not dropped when Classic Quake is switched to mid-flight: damage already paid for still lands.
//
// Not covered: a pellet in flight when the game is saved is lost (a flight is at most about two seconds, under
// water at the longest range); pellets do not wait for a target that has moved (they hit what they traced).

import { cvar_t, Cvar_VariableValue } from './cvar.js';
import { sv } from './server.js';
import { pr_global_struct, pr_globals_float, pr_functions, EDICT_TO_PROG, PROG_TO_EDICT } from './progs.js';
import { OFS_PARM0 } from './pr_comp.js';
import { ED_FindFunction } from './pr_edict.js';
import { PR_ExecuteProgram } from './pr_exec.js';
import { SHOTGUN, flightTime } from './shotgun_flight.js';
import { rayWaterOf } from './sv_shotrays.js';

// 0 keeps the shotgun's damage instant, as in stock Quake
export const sv_shotdelay = new cvar_t( 'sv_shotdelay', '1' );

const OFS_PARM1 = OFS_PARM0 + 3;
let pending = [];
const index = new Map(); // function name -> index in pr_functions (valid for one progs)
let indexed = null;

export const SV_ShotDelayCount = () => pending.length;
export function SV_ShotDelayClear() { pending = []; }
export const SV_ShotDelayPending = () => pending.map( b => ( { due: b.due, blast: b.blast, hurts: b.hurts, damage: b.damage, ent: b.ent } ) ); // (read-only view for tests)

const fn = name => {

	if ( indexed !== pr_functions ) { index.clear(); indexed = pr_functions; }
	let i = index.get( name );
	if ( i === undefined ) { const f = ED_FindFunction( name ); i = f ? pr_functions.indexOf( f ) : - 1; index.set( name, i ); }
	return i;

};

const copy3 = v => [ v[ 0 ], v[ 1 ], v[ 2 ] ];

// The delay exists only where the pellets are drawn: it is off with sv_shotdelay 0 and with r_shotgunfx 0.
// (`!( x > 0 )`: anything that is not a positive number, such as "off", counts as off.)
const enabled = () => sv_shotdelay.value > 0 && Cvar_VariableValue( 'r_shotgunfx' ) !== 0;

// Called when TraceAttack is entered from FireBullets during an observed blast: `blast` is the observer's token
// (its id and the traces so far; the last one is this pellet's). Snapshots the call and returns true when it
// was taken (the caller then has the interpreter skip it); false leaves it to run at once.
export function shotDelayCapture( blast ) {

	if ( ! enabled() ) return false;
	const rays = blast.rays, n = rays.length - 1;
	if ( n < 0 ) return false;
	const ray = rays[ n ], shooter = PROG_TO_EDICT( pr_global_struct.self ), K = SHOTGUN.unit;
	if ( shooter == null || shooter.free ) return false;
	const length = Math.hypot( ray.end[ 0 ] - ray.start[ 0 ], ray.end[ 1 ] - ray.start[ 1 ], ray.end[ 2 ] - ray.start[ 2 ] );
	// the pellet's path in source units, with the water it crosses (found once per ray: the event reuses it)
	const su = length / K, spans = rayWaterOf( ray ).map( ( [ a, b ] ) => [ a / K, b / K ] );
	const target = PROG_TO_EDICT( pr_global_struct.trace_ent );
	pending.push( { due: sv.time + flightTime( blast.id, n, su, spans ), blast: blast.id, shooter, shooterLife: shooter.freetime, damage: pr_globals_float[ OFS_PARM0 ],
		dir: [ pr_globals_float[ OFS_PARM1 ], pr_globals_float[ OFS_PARM1 + 1 ], pr_globals_float[ OFS_PARM1 + 2 ] ],
		ent: pr_global_struct.trace_ent, target, targetLife: target?.freetime, hurts: !! ( target && target.v.takedamage ),
		endpos: copy3( pr_global_struct.trace_endpos ), normal: copy3( pr_global_struct.trace_plane_normal ),
		up: copy3( pr_global_struct.v_up ), right: copy3( pr_global_struct.v_right ),
		// the world this belongs to: a pellet never lands in another map, program or entity array
		world: sv.edicts, program: pr_functions, map: sv.name } );
	return true;

}

const set3 = ( target, v ) => { target[ 0 ] = v[ 0 ]; target[ 1 ] = v[ 1 ]; target[ 2 ] = v[ 2 ]; };

// an entity still the one the pellet was shot by or at: not freed, and not freed and reused (freetime is set on every free)
const same = ( edict, life ) => edict != null && ! edict.free && edict.freetime === life;

// Start of a server frame: run the pellets whose flight is over.
export function SV_ShotDelayRun() {

	if ( pending.length === 0 ) return;
	// only this world's pellets: a map change or a loaded game leaves the old ones to be dropped here
	pending = pending.filter( b => b.world === sv.edicts && b.program === pr_functions && b.map === sv.name );
	if ( pending.length === 0 ) return;
	// a blast's pellets at one damageable target are one application, when the last of them has landed;
	// a pellet at anything else (the world: a puff) lands alone
	const groups = new Map();
	for ( const b of pending ) {

		const key = b.hurts ? b.blast + ':' + b.ent : null;
		if ( key === null ) { b.group = null; b.landing = b.due; continue; }
		let g = groups.get( key );
		if ( g === undefined ) { g = { landing: 0, members: [] }; groups.set( key, g ); }
		g.members.push( b ); g.landing = Math.max( g.landing, b.due ); b.group = g;

	}
	const ready = [], keep = [], seen = new Set();
	for ( const b of pending ) {

		const landing = b.group ? b.group.landing : b.due;
		if ( landing > sv.time ) { keep.push( b ); continue; }
		if ( b.group ) { if ( seen.has( b.group ) ) continue; seen.add( b.group ); ready.push( { landing, members: b.group.members } ); } else ready.push( { landing, members: [ b ] } );

	}
	pending = keep;
	if ( ready.length === 0 ) return;
	ready.sort( ( a, b ) => a.landing - b.landing || a.members[ 0 ].blast - b.members[ 0 ].blast );
	const attack = fn( 'TraceAttack' ), clear = fn( 'ClearMultiDamage' ), apply = fn( 'ApplyMultiDamage' );
	if ( attack < 0 || clear < 0 || apply < 0 ) return;
	const g = pr_global_struct;
	const saved = { self: g.self, other: g.other, time: g.time, ent: g.trace_ent, end: copy3( g.trace_endpos ), normal: copy3( g.trace_plane_normal ), up: copy3( g.v_up ), right: copy3( g.v_right ) };
	try {

		for ( const { members } of ready ) {

			const first = members[ 0 ];
			if ( ! same( first.shooter, first.shooterLife ) ) continue; // the shooter is gone
			g.self = EDICT_TO_PROG( first.shooter ); g.other = EDICT_TO_PROG( sv.edicts[ 0 ] ); g.time = sv.time;
			PR_ExecuteProgram( clear );
			for ( const b of members ) {

				if ( b.target != null && ! same( b.target, b.targetLife ) ) continue; // its target is gone: the pellet does nothing
				g.trace_ent = b.ent; set3( g.trace_endpos, b.endpos ); set3( g.trace_plane_normal, b.normal ); set3( g.v_up, b.up ); set3( g.v_right, b.right );
				pr_globals_float[ OFS_PARM0 ] = b.damage; pr_globals_float[ OFS_PARM1 ] = b.dir[ 0 ]; pr_globals_float[ OFS_PARM1 + 1 ] = b.dir[ 1 ]; pr_globals_float[ OFS_PARM1 + 2 ] = b.dir[ 2 ];
				PR_ExecuteProgram( attack );

			}
			PR_ExecuteProgram( apply );

		}

	} finally {

		g.self = saved.self; g.other = saved.other; g.time = saved.time; g.trace_ent = saved.ent;
		set3( g.trace_endpos, saved.end ); set3( g.trace_plane_normal, saved.normal ); set3( g.v_up, saved.up ); set3( g.v_right, saved.right );

	}

}
