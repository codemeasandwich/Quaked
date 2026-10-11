import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
// Card [LZ1]: drives one ordinary game of the full Quake (open with ?game=quake: laser.mdl, the Enforcers and the laser
// traps are not in the shareware) so a browser run can photograph real laser shots. The shots are the game's own: a
// laser trap's QuakeC `use` (spikeshooter_use -> LaunchLaser) and an Enforcer's own `enforcer_fire`, run by the
// progs exactly as the game runs them. The trial only chooses where the player stands (god mode, no target) and when
// to pause; the game's `pause` freezes cl.time, which is what the picture is a function of. No gameplay is altered.
const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );
async function until( test, label, ms = 240000 ) { const end = performance.now() + ms; while ( ! test() ) { if ( performance.now() > end ) throw Error( label + ' exceeded its deadline' ); await sleep( 50 ); } }
await import( '../main.js' ); await until( () => window.Cbuf_AddText && window.renderer, 'native initialization' );
const { cl, cls, cl_visedicts, cl_numvisedicts } = await import( '../src/engine/client/client.js' ), client = await import( '../src/engine/client/client.js' ), { sv } = await import( '../src/engine/server/server.js' );
const { Cbuf_AddText } = await import( '../src/engine/common/cmd.js' );
const { Cvar_SetValue } = await import( '../src/engine/common/cvar.js' );
const keys = await import( '../src/engine/client/keys.js' );
const progs = await import( '../src/engine/progs/progs.js' ), { PR_ExecuteProgram } = await import( '../src/engine/progs/pr_exec.js' ), { ED_FindFunction } = await import( '../src/engine/progs/pr_edict.js' );
const { SV_LinkEdict, SV_Move, MOVE_NOMONSTERS } = await import( '../src/engine/server/world.js' );
const sb = await import( '../src/newer/render/r_stasisbolt.js' );
const errors = []; window.addEventListener( 'error', e => errors.push( e.message ) ); window.addEventListener( 'unhandledrejection', e => errors.push( String( e.reason?.stack || e.reason ) ) );
void cl_visedicts; void cl_numvisedicts;

const ZERO = [ 0, 0, 0 ];
const classname = e => progs.PR_GetString( e.v.classname );
const live = () => ( sv.edicts || [] ).filter( e => e && ! e.free );
function call( name, self ) {

	const previous = progs.pr_global_struct.self;
	try { progs.pr_global_struct.self = progs.EDICT_TO_PROG( self ); PR_ExecuteProgram( progs.pr_functions.indexOf( ED_FindFunction( name ) ) ); } finally { progs.pr_global_struct.self = previous; }

}
// the player stands at `point` (hull checked) looking at `at`
function place( point, at ) {

	const p = sv.edicts[ 1 ], fit = SV_Move( point, p.v.mins, p.v.maxs, point, MOVE_NOMONSTERS, p );
	if ( fit.startsolid || fit.allsolid ) return false;
	const d = [ at[ 0 ] - point[ 0 ], at[ 1 ] - point[ 1 ], at[ 2 ] - point[ 2 ] - 22 ];
	const angles = [ - Math.atan2( d[ 2 ], Math.hypot( d[ 0 ], d[ 1 ] ) ) * 180 / Math.PI, Math.atan2( d[ 1 ], d[ 0 ] ) * 180 / Math.PI, 0 ];
	p.v.flags |= 64 | 128; p.v.movetype = 0; p.v.origin = point; p.v.velocity = ZERO; p.v.angles = angles; p.v.v_angle = angles; p.v.fixangle = 1;
	cl.viewangles.set( angles ); SV_LinkEdict( p, false );
	return true;

}
// clear sight between two points (world only)
const clear = ( a, b ) => SV_Move( a, ZERO, ZERO, b, MOVE_NOMONSTERS, sv.edicts[ 1 ] ).fraction > .999;
// a viewpoint beside a shot's path: `along` units down the path, `side` units off it, with clear sight of the path
function beside( from, dir, along, side ) {

	const mid = [ from[ 0 ] + dir[ 0 ] * along, from[ 1 ] + dir[ 1 ] * along, from[ 2 ] + dir[ 2 ] * along ];
	for ( const s of [ side, - side, side * .7, - side * .7, side * .5, - side * .5, side * 1.4, - side * 1.4 ] ) for ( const lift of [ 0, 24, - 16, 48 ] ) {

		const h = Math.hypot( dir[ 0 ], dir[ 1 ] ) || 1, px = - dir[ 1 ] / h, py = dir[ 0 ] / h;
		const eye = [ mid[ 0 ] + px * s, mid[ 1 ] + py * s, mid[ 2 ] + lift ], feet = [ eye[ 0 ], eye[ 1 ], eye[ 2 ] - 22 ];
		if ( ! clear( eye, mid ) ) continue;
		if ( place( feet, mid ) ) return { eye, mid };

	}
	return null;

}
let stage = null;
function line( from, dir ) {

	const end = [ from[ 0 ] + dir[ 0 ] * 4096, from[ 1 ] + dir[ 1 ] * 4096, from[ 2 ] + dir[ 2 ] * 4096 ], t = SV_Move( from, ZERO, ZERO, end, MOVE_NOMONSTERS, sv.edicts[ 1 ] );
	return { from, dir, end: Array.from( t.endpos ), length: t.fraction * 4096 };

}
window.stasisTrial = {
	errors,
	async start( newer = true, map = 'e2m1' ) {

		Cvar_SetValue( 'r_hdr', newer ? 1 : 0 ); keys.set_key_dest( keys.key_game );
		Cbuf_AddText( 'disconnect\nmaxplayers 1\nr_demosplit 0\nskill 1\nbgmvolume 0\nshowpause 0\nscr_showpause 0\ncon_notifytime 0\nmap ' + map + '\n' );
		await until( () => ! cls.demoplayback && cls.signon === 4 && sv.active && cl.worldmodel?.name === 'maps/' + map + '.bsp' && cl.stats[ 0 ] > 0, 'level signon' );
		await until( () => cl.time > 2.5 && sv.active && sv.edicts, 'the level running' );
		return { map, newer, traps: this.traps().length, enforcers: this.enforcers().length };

	},
	// staging only: every monster but `keep` leaves the level (QuakeC's own SUB_Remove), so nothing stands in a shot's
	// way; the shots, their flight and their impacts stay the game's
	clearMonsters( keep = - 1 ) { let n = 0; for ( const e of live() ) if ( ( e.v.flags & 32 ) && sv.edicts.indexOf( e ) !== keep ) { call( 'SUB_Remove', e ); n ++; } return n; },
	mode( newer ) { Cvar_SetValue( 'r_hdr', newer ? 1 : 0 ); },
	cvar( value ) { Cvar_SetValue( 'r_stasisbolt', value ); },
	traps() { return live().filter( e => /^trap_(spike)?shooter$/.test( classname( e ) ) && ( e.v.spawnflags & 2 ) ).map( e => ( { index: sv.edicts.indexOf( e ), origin: Array.from( e.v.origin ), movedir: Array.from( e.v.movedir ) } ) ); },
	enforcers() { return live().filter( e => classname( e ) === 'monster_enforcer' && e.v.health > 0 ).map( e => ( { index: sv.edicts.indexOf( e ), origin: Array.from( e.v.origin ) } ) ); },
	// a shot's line: where it starts, its direction and where the world stops it (a point trace, as the laser's own
	// flight would meet the wall)
	shotOfTrap( index ) { const t = sv.edicts[ index ]; return line( Array.from( t.v.origin ), Array.from( t.v.movedir ) ); },
	// an Enforcer's shot at the first clear heading (enforcer_fire starts it 30 forward, 8.5 right, 16 up)
	shotOfEnforcer( index, min = 300 ) {

		const e = sv.edicts[ index ], o = Array.from( e.v.origin );
		for ( let yaw = 0; yaw < 360; yaw += 15 ) {

			const a = yaw * Math.PI / 180, f = [ Math.cos( a ), Math.sin( a ), 0 ], r = [ Math.sin( a ), - Math.cos( a ), 0 ];
			const from = [ o[ 0 ] + f[ 0 ] * 30 + r[ 0 ] * 8.5, o[ 1 ] + f[ 1 ] * 30 + r[ 1 ] * 8.5, o[ 2 ] + 16 ], shot = line( from, f );
			if ( shot.length >= min ) return { ...shot, yaw, index };

		}
		return null;

	},
	// stand `side` units beside the shot's line, `along` units down it (negative: from its end), looking at that point
	view( shot, along, side = 130 ) {

		const base = along < 0 ? shot.length + along : along;
		for ( const a of [ base, base - 30, base + 30, base - 60, base + 60 ] ) {

			if ( a < 20 || a > shot.length - 20 ) continue;
			const seen = beside( shot.from, shot.dir, a, side );
			if ( seen ) { stage = { ...seen, shot, along: a }; return stage; }

		}
		stage = null; return null;

	},
	// stand `back` units in front of where the shot will strike, a little to its `side`, looking at that point
	viewImpact( shot, back = 110, side = 40 ) {

		const d = shot.dir, e = shot.end, h = Math.hypot( d[ 0 ], d[ 1 ] ) || 1, px = - d[ 1 ] / h, py = d[ 0 ] / h;
		for ( const b of [ back, back * .8, back * 1.3, back * .6 ] ) for ( const s of [ side, - side, 0, side * 2, - side * 2 ] ) {

			const eye = [ e[ 0 ] - d[ 0 ] * b + px * s, e[ 1 ] - d[ 1 ] * b + py * s, e[ 2 ] - d[ 2 ] * b ];
			if ( ! clear( eye, [ e[ 0 ] - d[ 0 ] * 2, e[ 1 ] - d[ 1 ] * 2, e[ 2 ] - d[ 2 ] * 2 ] ) ) continue;
			if ( place( [ eye[ 0 ], eye[ 1 ], eye[ 2 ] - 22 ], e ) ) { stage = { eye, mid: e, shot }; return stage; }

		}
		stage = null; return null;

	},
	// the trap fires, as its trigger would make it
	fireTrap( index ) { call( 'spikeshooter_use', sv.edicts[ index ] ); return cl.time; },
	// the Enforcer fires its own laser along `shot` (the player stands at the aim point for the instant the progs aim,
	// then returns to the viewpoint)
	enforcerFire( shot ) {

		const p = sv.edicts[ 1 ], e = sv.edicts[ shot.index ], back = Array.from( p.v.origin ), o = Array.from( e.v.origin );
		p.v.origin = [ o[ 0 ] + shot.dir[ 0 ] * 200, o[ 1 ] + shot.dir[ 1 ] * 200, o[ 2 ] ];
		e.v.enemy = progs.EDICT_TO_PROG( p ); e.v.angles = [ 0, shot.yaw, 0 ];
		call( 'enforcer_fire', e );
		p.v.origin = back; SV_LinkEdict( p, false );
		return cl.time;

	},
	// pause the game `delay` seconds of game time after a laser comes within `reach` units of the viewed point
	// ('near'), a bolt impact is live ('impact'), or a laser that was drawn is gone ('gone': its native impact, for
	// Classic); gives up after `limit` ms of real time
	pauseWhen( kind, delay = 0, reach = 40, limit = 20000 ) {

		return new Promise( resolve => {

			let seen = null, flown = false; const begun = performance.now();
			const tick = () => {

				const s = sb.R_StasisBoltSnapshot(), m = stage?.mid;
				const lasers = this.lasers();
				if ( lasers.length > 0 ) flown = true;
				const ok = kind === 'impact' ? s.impacts > 0 : kind === 'gone' ? flown && lasers.length === 0 : lasers.some( l => m && Math.hypot( l.origin[ 0 ] - m[ 0 ], l.origin[ 1 ] - m[ 1 ], l.origin[ 2 ] - m[ 2 ] ) < reach );
				if ( ok && seen === null ) seen = cl.time;
				const late = performance.now() - begun > limit;
				if ( late || ( seen !== null && cl.time - seen >= delay ) ) { if ( ! cl.paused ) Cbuf_AddText( 'pause\n' ); resolve( { met: ! late, ...this.snapshot() } ); return; }
				requestAnimationFrame( tick );

			};
			tick();

		} );

	},
	thaw() { if ( cl.paused ) Cbuf_AddText( 'pause\n' ); },
	freeze() { if ( ! cl.paused ) Cbuf_AddText( 'pause\n' ); },
	// the laser entities the client is drawing this frame, and whether their native mesh is shown
	lasers() {

		const out = [];
		for ( let i = 0; i < client.cl_numvisedicts; i ++ ) {

			const e = client.cl_visedicts[ i ];
			if ( e?.model?.name === 'progs/laser.mdl' ) out.push( { origin: Array.from( e.origin ), angles: Array.from( e.angles ), nativeMesh: !! e._aliasMesh?.parent && e._aliasMesh.visible !== false } );

		}
		return out;

	},
	cmd( text ) { Cbuf_AddText( text + '\n' ); },
	snapshot() { return { ...sb.R_StasisBoltSnapshot(), lasers: this.lasers(), time: cl.time, paused: !! cl.paused, hdr: window.Cvar_VariableValue?.( 'r_hdr' ), errors: [ ...errors ], stage }; }
};
document.getElementById( 'loading' )?.remove();
