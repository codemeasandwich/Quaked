// Independent real stock QuakeC teleport/server clock/save boundaries.
// GPU effect fidelity is a separate browser proof owned by the implementer.
import { readFileSync } from 'node:fs';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile, COM_SetNewerMapsEnabled } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { ED_FindFunction, ED_Write, ED_ParseEdict, ED_Alloc, ED_Free, ED_NewString } from '../src/engine/progs/pr_edict.js';
import { sv, svs, client_t, ss_loading, FL_ONGROUND, FL_FLY, FL_SWIM } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { SV_RunTriggerTouch, SV_LinkEdict, SV_Move, MOVE_NORMAL } from '../src/engine/server/world.js';
import { SV_Physics, SV_Physics_Step, SV_RunThink, SV_SetFrametime, sv_gravity } from '../src/engine/server/sv_phys.js';
import { SV_RendVeilLocalActive, SV_RendVeilHolding, SV_RendVeilClientRecord, Rend_ParseRecord } from '../src/newer/gameplay/sv_rendveil.js';
import { Rend_Schedule } from '../src/newer/gameplay/rend_veil_state.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { skill } from '../src/engine/server/host.js';
import { cl, cls, ca_connected } from '../src/engine/client/client.js';
import { NET_Init, NET_Connect, NET_CheckNewConnections, NET_Close } from '../src/engine/net/net_main.js';
import { CL_ParseUpdate, CL_EntityNum } from '../src/engine/client/cl_parse.js';
import { CL_RelinkEntities } from '../src/engine/client/cl_main.js';
import { CL_ResetPrediction, CL_GetEntityFrame, CL_SetServerSequence, CL_SetValidSequence } from '../src/engine/client/cl_pred.js';
import { COM_SetNetMessage, MSG_BeginReading, MSG_WriteByte, SZ_Alloc, sizebuf_t } from '../src/engine/common/common.js';
import { entity_state_t } from '../src/engine/common/quakedef.js';

const check = ( value, label ) => { if ( ! value ) throw Error( label ); };
const same = ( actual, expected, label ) => check( actual === expected, `${label}: ${actual} !== ${expected}` );
const text = index => progs.PR_GetString( index );
const bytes = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'rend-veil-native-pak0', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) );
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); Cbuf_Init(); SV_Init();
for ( const variable of [ r_hdr, skill, sv_gravity ] ) if ( ! Cvar_FindVar( variable.name ) ) Cvar_RegisterVariable( variable );
svs.maxclients = svs.maxclientslimit = 1; NET_Init();

function native( entity, functionOrName ) {
	const fn = typeof functionOrName === 'number' ? functionOrName : progs.pr_functions.indexOf( ED_FindFunction( functionOrName ) );
	check( fn > 0, 'actual native QC function exists: ' + functionOrName );
	progs.pr_global_struct.self = progs.EDICT_TO_PROG( entity ); progs.pr_global_struct.time = sv.time; PR_ExecuteProgram( fn );
}

function setup() {
	if ( cls.netcon && ! cls.netcon.disconnected ) NET_Close( cls.netcon );
	Cvar_SetValue( 'r_hdr', 1 ); Cvar_SetValue( 'skill', 1 ); R_AnimSetClassicPass( false ); COM_SetNewerMapsEnabled( false );
	svs.clients = [ new client_t() ]; svs.maxclients = 1; sv.active = false; SV_SpawnServer( 'e1m2' );
	const serverClient = svs.clients[ 0 ], player = serverClient.edict;
	native( player, progs.pr_global_struct.SetNewParms ); native( player, progs.pr_global_struct.ClientConnect ); native( player, progs.pr_global_struct.PutClientInServer );
	const local = NET_Connect( 'local' ), peer = NET_CheckNewConnections();
	check( local && peer && local.driverdata === peer && peer.driverdata === local, 'actual native reciprocal loopback pair' );
	serverClient.netconnection = peer; serverClient.active = true; serverClient.spawned = true;
	cls.netcon = local; cls.state = ca_connected; cls.signon = 4; cls.demoplayback = cls.timedemo = false; cl.maxclients = 1;
	check( SV_RendVeilLocalActive(), 'actual native Newer local stock QC scope admitted' );
	return { player, local, peer, serverClient };
}

function closet() {
	const trigger = sv.edicts.find( e => e && ! e.free && text( e.v.classname ) === 'trigger_teleport' && text( e.v.targetname ) === 't53' && text( e.v.target ) === 't54' );
	check( trigger && trigger.v.touch && trigger.v.use, 'actual E1M2 named t53/t54 stock monster teleport exists' );
	same( text( progs.pr_functions[ trigger.v.touch ].s_name ), 'teleport_touch', 'touch remains shipped native teleport implementation' );
	const destination = sv.edicts.find( e => e && ! e.free && text( e.v.targetname ) === 't54' );
	check( destination && text( destination.v.classname ) === 'info_teleport_destination', 'actual stock QC teleport receiver exists' );
	const centre = Array.from( trigger.v.absmin, ( value, i ) => ( value + trigger.v.absmax[ i ] ) / 2 );
	const monsters = sv.edicts.filter( e => e && ! e.free && e.v.health > 0 && text( e.v.classname ).startsWith( 'monster_' ) );
	monsters.sort( ( a, b ) => Math.hypot( ...Array.from( a.v.origin, ( value, i ) => value - centre[ i ] ) ) - Math.hypot( ...Array.from( b.v.origin, ( value, i ) => value - centre[ i ] ) ) );
	const monster = monsters[ 0 ]; check( monster, 'native map supplies actual living closet monster' );
	monster.v.origin = centre; SV_LinkEdict( monster, false );
	return { trigger, destination, monster, centre };
}

function activate( trigger, player ) {
	progs.pr_global_struct.other = progs.EDICT_TO_PROG( player ); native( trigger, trigger.v.use );
	check( trigger.v.nextthink > sv.time, 'actual native teleport_use opens its timed touch window' );
}
function arrive() {
	const scope = setup(), fixture = closet(); activate( fixture.trigger, scope.player );
	const before = Array.from( fixture.monster.v.origin ), self = progs.pr_global_struct.self, other = progs.pr_global_struct.other; SV_RunTriggerTouch( fixture.monster, fixture.trigger );
	same( progs.pr_global_struct.self, self, 'public dispatch restores native caller self context' ); same( progs.pr_global_struct.other, other, 'public dispatch restores native caller other context' );
	check( Array.from( fixture.monster.v.origin ).some( ( value, i ) => Math.abs( value - before[ i ] ) > 1 ), 'actual native QC touch teleports monster' );
	check( fixture.monster._rendVeil, 'actual named native arrival creates one finite rite record' );
	return { ...scope, ...fixture };
}
function encoded( entity ) { const lines = []; ED_Write( lines, entity ); return lines.join( '\n' ); }
function restore( entity, record ) { ED_ParseEdict( record.slice( record.indexOf( '{' ) + 1 ), entity ); }
function groundAtReceiver( fixture ) {
	const from = Array.from( fixture.destination.v.origin ), to = from.slice(); to[ 2 ] -= 256;
	const trace = SV_Move( from, fixture.monster.v.mins, fixture.monster.v.maxs, to, MOVE_NORMAL, fixture.monster );
	check( ! trace.allsolid && ! trace.startsolid && trace.fraction < 1 && trace.plane.normal[ 2 ] > .7, 'real E1M2 receiver has valid native support below walking hull' );
	return trace;
}
function nearOrigin( actual, expected, label ) { actual.forEach( ( value, i ) => check( Math.abs( value - expected[ i ] ) <= .002, `${label} axis${i}: ${value} != ${expected[ i ]}` ) ); }
function spawnStockMonster( classname, centre ) {
	const entity = ED_Alloc(), previousState = sv.state;
	entity.v.classname = ED_NewString( classname ); entity.v.origin = centre;
	// Execute the shipped spawn function through the same public loading state
	// used by map initialization, so wizard/fish precaches and flags are native.
	try { sv.state = ss_loading; native( entity, classname ); }
	finally { sv.state = previousState; }
	check( ! entity.free && entity.v.health > 0, 'actual stock QC spawn creates living ' + classname );
	if ( classname === 'monster_wizard' || classname === 'monster_fish' ) {
		// Stock fly/swim flags are installed by the first scheduled initializer,
		// not necessarily by the initial spawn function. Run that actual thinker.
		sv.time = Math.max( sv.time + .1, entity.v.nextthink + .0001 ); SV_SetFrametime( .01 ); SV_RunThink( entity );
		entity.v.origin = centre;
	}
	SV_LinkEdict( entity, false ); return entity;
}

Deno.test( 'actual E1M2 named stock QC arrival holds only its native AI through2.5Focus then retains a finite2.8tail', () => {
	const f = arrive(), monster = f.monster, rite = monster._rendVeil, start = rite.start;
	same( Rend_Schedule().focusAt, 2.5, 'effective supplied analytical Focus deadline' ); same( Rend_Schedule().totalDuration, 2.8, 'effective supplied analytical tail deadline' );
	const support = groundAtReceiver( f ); nearOrigin( Array.from( monster.v.origin ), Array.from( support.endpos ), 'walking rite settles on actual native receiver support before holding' );
	nearOrigin( rite.origin, Array.from( monster.v.origin ), 'record is captured from settled native pose' );
	same( SV_RendVeilClientRecord( monster.index, text( monster.v.model ) ), rite, 'public local client bridge receives actual individual arrival record' );
	// A real shipped animation callback supplies an observable due native thinker.
	const animation = text( monster.v.model ).includes( 'soldier' ) ? 'army_stand2' : 'knight_stand2';
	const stand = ED_FindFunction( animation ); check( stand, 'shipped model-matching native animation callback exists' );
	monster.v.think = progs.pr_functions.indexOf( stand ); monster.v.nextthink = start + .05; monster.v.frame = 0;
	monster.v.velocity = [ 80, 30, 0 ]; const origin = Array.from( monster.v.origin ), velocity = Array.from( monster.v.velocity ), nextthink = monster.v.nextthink;
	const control = sv.edicts.find( e => e && e !== monster && ! e.free && e.v.health > 0 && text( e.v.classname ) === text( monster.v.classname ) );
	check( control, 'native same-type monster outside this arrival supplies independent AI control' );
	control.v.think = progs.pr_functions.indexOf( stand ); control.v.nextthink = start + .05; control.v.frame = 0;
	for ( const age of [ 0, .5, 1.5, 2.499 ] ) {
		sv.time = start + age; SV_SetFrametime( .0001 );
		check( SV_RendVeilHolding( monster ), 'server clock holds arrived monster beforeFocus ' + age );
		check( SV_RunThink( monster ), 'public think boundary retains held monster' );
		same( monster.v.nextthink, nextthink, 'pending native thinker preserved beforeFocus' ); same( monster.v.frame, 0, 'actual native animation callback not run beforeFocus' );
		SV_Physics(); same( Array.from( monster.v.origin ).join(), origin.join(), 'full native physics holds individual position beforeFocus' ); same( Array.from( monster.v.velocity ).join(), velocity.join(), 'full native physics holds individual velocity beforeFocus' );
		check( sv.time > start + age, 'individual hold does not freeze native world clock' );
		if ( age === .5 ) check( control.v.frame !== 0, 'unheld native same-type monster thinker continues during arrival hold' );
	}
	sv.time = start + 2.5; check( ! SV_RendVeilHolding( monster ), 'AI releases exactly at analyticalFocus without any renderer' );
	SV_RunThink( monster ); check( monster.v.frame !== 0 && monster.v.nextthink > sv.time, 'overdue actual native animation resumes atFocus' );
	same( monster._rendVeil, rite, 'Focus retains original rite for finite effect tail' );
	sv.time = start + 2.799; same( SV_RendVeilClientRecord( monster.index ), rite, 'client effect tail persists before2.8' );
	sv.time = start + 2.8; same( SV_RendVeilClientRecord( monster.index ), null, 'client effect record retires at2.8' ); same( monster._rendVeil, null, 'native tail metadata retired' );
	console.log( 'REND_NATIVE_ARRIVAL_CLOCK ' + JSON.stringify( { map: sv.name, trigger: f.trigger.index, targetname: text( f.trigger.v.targetname ), monster: monster.index, classname: text( monster.v.classname ), start, focusAt: Rend_Schedule().focusAt, totalDuration: Rend_Schedule().totalDuration, resumedFrame: monster.v.frame } ) );
} );

Deno.test( 'native failed, dead and unnamed teleport touches cannot fabricate or retrigger an arrival rite', () => {
	let scope = setup(), f = closet();
	// Named stock teleport before teleport_use is a real QC no-op.
	const before = Array.from( f.monster.v.origin ).join(); SV_RunTriggerTouch( f.monster, f.trigger );
	same( Array.from( f.monster.v.origin ).join(), before, 'actual inactive named teleport remains native no-op' ); same( f.monster._rendVeil, null, 'failed native teleport creates no visual record' );
	activate( f.trigger, scope.player ); f.monster.v.health = 0; SV_RunTriggerTouch( f.monster, f.trigger ); same( f.monster._rendVeil, null, 'dead monster never acquires arrival rite' );
	scope = setup(); f = closet(); activate( f.trigger, scope.player ); f.trigger.v.targetname = 0;
	SV_RunTriggerTouch( f.monster, f.trigger ); check( Math.hypot( ...Array.from( f.monster.v.origin, ( value, i ) => value - f.destination.v.origin[ i ] ) ) <= 1, 'unnamed control still executes ordinary native teleport' ); same( f.monster._rendVeil, null, 'ordinary unnamed teleporter creates no closet rite' );
	f = arrive(); const record = f.monster._rendVeil, pending = f.monster.v.nextthink, origin = Array.from( f.monster.v.origin ).join();
	SV_RunTriggerTouch( f.monster, f.trigger ); same( f.monster._rendVeil, record, 'held native arrival touch cannot replace/restart its finite record' ); same( f.monster.v.nextthink, pending, 'rejected retrigger retains pending native thinker' ); same( Array.from( f.monster.v.origin ).join(), origin, 'rejected retrigger does not run another native teleport' );
	f.monster.v.health = 0; same( SV_RendVeilClientRecord( f.monster.index ), null, 'native death retires active rite immediately' ); check( ! SV_RendVeilHolding( f.monster ), 'dead monster cannot retain AI hold' );
} );

Deno.test( 'public local authority gate and native touch preserve Classic, remote, demo and stale-peer behavior', () => {
	const scope = setup(), f = closet(), mutations = [
		[ 'Classic', () => Cvar_SetValue( 'r_hdr', 0 ), () => Cvar_SetValue( 'r_hdr', 1 ) ],
		[ 'Classic split pass', () => R_AnimSetClassicPass( true ), () => R_AnimSetClassicPass( false ) ],
		[ 'demo', () => cls.demoplayback = true, () => cls.demoplayback = false ],
		[ 'timedemo', () => cls.timedemo = true, () => cls.timedemo = false ],
		[ 'remote driver', () => scope.local.driver = 1, () => scope.local.driver = 0 ],
		[ 'closed client', () => scope.local.disconnected = true, () => scope.local.disconnected = false ],
		[ 'closed server peer', () => scope.peer.disconnected = true, () => scope.peer.disconnected = false ],
		[ 'unpaired client', () => scope.local.driverdata = null, () => scope.local.driverdata = scope.peer ],
		[ 'nonreciprocal peer', () => scope.peer.driverdata = null, () => scope.peer.driverdata = scope.local ],
		[ 'stale server connection', () => scope.serverClient.netconnection = {}, () => scope.serverClient.netconnection = scope.peer ],
		[ 'inactive local client', () => scope.serverClient.active = false, () => scope.serverClient.active = true ],
		[ 'multiplayer', () => svs.maxclients = 2, () => svs.maxclients = 1 ],
		[ 'modified QuakeC', () => progs.PR_SetCRC( 1 ), () => progs.PR_SetCRC( 24778 ) ],
	];
	for ( const [ label, change, reset ] of mutations ) {
		activate( f.trigger, scope.player ); f.monster._rendVeil = null; f.monster.v.origin = f.centre; SV_LinkEdict( f.monster, false );
		try { change(); check( ! SV_RendVeilLocalActive(), 'unsupported scope rejected: ' + label ); SV_RunTriggerTouch( f.monster, f.trigger ); same( f.monster._rendVeil, null, 'unsupported native arrival owns no hold: ' + label ); check( Math.hypot( ...Array.from( f.monster.v.origin, ( value, i ) => value - f.destination.v.origin[ i ] ) ) <= 1, 'unsupported scope retains actual native teleport destination: ' + label ); }
		finally { reset(); }
	}
	console.log( 'REND_NATIVE_SCOPE_CONTROLS ' + JSON.stringify( mutations.map( entry => entry[ 0 ] ) ) );
} );

Deno.test( 'actual ED save/parse roundtrip preserves active finite record and rejects malformed or recycled metadata', () => {
	const f = arrive(), original = JSON.stringify( f.monster._rendVeil ), saved = encoded( f.monster ), copy = ED_Alloc();
	check( saved.includes( '"_newer_rend_veil"' ), 'actual ED serializer retains valid living arrival record' ); restore( copy, saved ); same( JSON.stringify( copy._rendVeil ), original, 'native ED parser preserves exact start/model/origin' );
	check( SV_RendVeilHolding( copy ), 'restored native record retains actual server AI hold' ); same( SV_RendVeilClientRecord( copy.index, 'progs/invalid.mdl' ), null, 'client bridge cannot borrow record for different model' );
	const record = f.monster._rendVeil, encode = value => encodeURIComponent( JSON.stringify( value ) );
	for ( const patch of [ { version: 2 }, { start: -1 }, { start: 1e9 + 1 }, { start: null }, { model: '../unsafe.mdl' }, { origin: [ 0, 0 ] }, { origin: [ 0, 0, 1e6 + 1 ] }, { origin: [ 0, 0, null ] } ] ) {
		same( Rend_ParseRecord( encode( { ...record, ...patch } ) ), null, 'public saved metadata rejects invalid tuple ' + JSON.stringify( patch ) );
		const invalid = ED_Alloc(); restore( invalid, '{ "classname" "monster_army" "_newer_rend_veil" "' + encode( { ...record, ...patch } ) + '" }' ); same( invalid._rendVeil, null, 'actual native ED parser rejects malformed saved arrival tuple' ); ED_Free( invalid );
	}
	same( Rend_ParseRecord( '%malformed' ), null, 'invalid URI rejected' ); same( Rend_ParseRecord( 'x'.repeat( 1025 ) ), null, 'oversized saved metadata rejected' );
	const slot = copy.index; ED_Free( copy ); sv.time += 1; const reused = ED_Alloc(); same( reused.index, slot, 'actual allocator reuses saved record slot' ); same( reused._rendVeil, null, 'new edict lifetime never inherits retired arrival hold' );
	console.log( 'REND_NATIVE_SAVE_RECORD ' + original );
} );

Deno.test( 'actual NQ and public QW update paths carry the same authoritative server clock and retire the expired effect', () => {
	const f = arrive(), monster = f.monster, client = CL_EntityNum( monster.index ), rite = monster._rendVeil;
	cl.model_precache = sv.models.slice(); cl.num_entities = sv.num_edicts; cl.maxclients = 1; client.baseline.modelindex = monster.v.modelindex;
	const packet = new sizebuf_t(); SZ_Alloc( packet, 256 ); MSG_WriteByte( packet, monster.index ); COM_SetNetMessage( packet ); MSG_BeginReading();
	cl.mtime[ 0 ] = cl.time = 100; CL_ParseUpdate( 0 );
	same( client._rendVeil, rite, 'actual NQ packet parse carries individual server record' ); same( client._rendVeilTime, sv.time, 'NQ effect clock is native time rather than unrelated client timestamp' );
	const state = new entity_state_t(); state.number = monster.index; state.modelindex = monster.v.modelindex; state.origin.set( monster.v.origin ); state.angles.set( monster.v.angles ); state.frame = monster.v.frame;
	CL_ResetPrediction();
	try {
		for ( const [ seq, age ] of [ [ 1, .3 ], [ 2, 2.6 ], [ 3, 2.8 ] ] ) {
			sv.time = rite.start + age;
			const frame = CL_GetEntityFrame( seq ); frame.invalid = false; frame.packet_entities.num_entities = 1; frame.packet_entities.entities[ 0 ].copyFrom( state );
			CL_SetServerSequence( seq ); CL_SetValidSequence( seq ); cl.mtime[ 1 ] = cl.mtime[ 0 ]; cl.mtime[ 0 ] += .1; cl.time = cl.mtime[ 0 ];
			CL_RelinkEntities();
			if ( age < 2.8 ) { same( client._rendVeil, rite, 'public QW relink keeps same individual finite record before expiry' ); same( client._rendVeilTime, sv.time, 'public QW relink supplies authoritative server clock' ); }
			else { same( client._rendVeil, null, 'actual QW relink retires native expired effect' ); same( client._rendVeilTime, null, 'QW expired effect leaves no stale time binding' ); }
		}
		console.log( 'REND_NATIVE_CLIENT_CLOCK ' + JSON.stringify( { monster: monster.index, start: rite.start, nativeTime: sv.time, unrelatedClientTime: cl.time, expiredRecord: client._rendVeil, expiredClock: client._rendVeilTime } ) );
	} finally { CL_ResetPrediction(); }
} );

Deno.test( 'actual walking soldier and knight arrivals are grounded before holding and cannot drop at the Focus gravity tick', () => {
	const receipts = [];
	for ( const classname of [ 'monster_army', 'monster_knight' ] ) {
		const scope = setup(), f = closet(); f.monster = spawnStockMonster( classname, f.centre );
		const support = groundAtReceiver( f ), receiver = Array.from( f.destination.v.origin );
		check( support.endpos[ 2 ] < receiver[ 2 ] - 1, 'native E1M2 fixture exposes measurable receiver hover before settling' );
		activate( f.trigger, scope.player ); SV_RunTriggerTouch( f.monster, f.trigger );
		const entity = f.monster, rite = entity._rendVeil; check( rite, 'actual supported walking arrival owns finite rite' );
		nearOrigin( Array.from( entity.v.origin ), Array.from( support.endpos ), 'walking arrival matches independent native support trace' );
		check( entity.v.flags & FL_ONGROUND, 'walking arrival has actual native onground flag before hold' );
		same( entity.v.groundentity, progs.EDICT_TO_PROG( support.ent ), 'walking arrival retains native supporting entity' );
		nearOrigin( rite.origin, Array.from( entity.v.origin ), 'saved/transported rite origin records settled pose' );
		const saved = encoded( entity ), clone = ED_Alloc(); restore( clone, saved ); nearOrigin( clone._rendVeil.origin, Array.from( support.endpos ), 'actual ED save/parse preserves grounded effect pose' ); ED_Free( clone );
		// Freeze only independent locomotion for this gravity check; a real
		// native SUB_Null thinker preserves the ordinary SV_Physics_Step path.
		entity.v.think = progs.pr_functions.indexOf( ED_FindFunction( 'SUB_Null' ) ); entity.v.nextthink = rite.start + .1; entity.v.velocity = [ 0, 0, 0 ];
		for ( const age of [ .5, 1.5, 2.499 ] ) { sv.time = rite.start + age; check( SV_RendVeilHolding( entity ), 'grounded arrival is held before Focus' ); SV_SetFrametime( .0001 ); SV_Physics(); nearOrigin( Array.from( entity.v.origin ), Array.from( support.endpos ), 'grounded pose stays fixed through hold' ); }
		sv.time = rite.start + 2.5; check( ! SV_RendVeilHolding( entity ), 'walking AI hold releases at Focus' ); SV_SetFrametime( .05 ); SV_Physics_Step( entity );
		nearOrigin( Array.from( entity.v.origin ), Array.from( support.endpos ), 'first real released gravity tick has no vertical drop' ); same( entity.v.velocity[ 2 ], 0, 'grounded Focus release does not acquire falling speed' );
		receipts.push( { classname, receiver, settled: Array.from( entity.v.origin ), groundentity: entity.v.groundentity, savedOrigin: rite.origin } );
	}
	console.log( 'REND_NATIVE_GROUNDED_FOCUS ' + JSON.stringify( receipts ) );
} );

Deno.test( 'actual stock wizard and native swim-initialized soldier preserve flying and swimming floor policies', () => {
	const receipts = [];
	// Shareware pak0 does not contain progs/fish.mdl. The swimming control uses
	// a real stock soldier/model/hull with the shipped swimmonster_start QC
	// initializer. This tests native FL_SWIM policy without fabricating fish art.
	check( ! COM_FindFile( 'progs/fish.mdl' ), 'available shareware pack lacks registered fish model; swimming fixture provenance is explicit' );
	for ( const [ classname, flag ] of [ [ 'monster_wizard', FL_FLY ], [ 'monster_army', FL_SWIM ] ] ) {
		const scope = setup(), f = closet(); f.monster = spawnStockMonster( classname, f.centre );
		if ( flag === FL_SWIM ) {
			native( f.monster, 'swimmonster_start' ); sv.time = Math.max( sv.time + .1, f.monster.v.nextthink + .0001 ); SV_SetFrametime( .01 ); SV_RunThink( f.monster ); f.monster.v.origin = f.centre; SV_LinkEdict( f.monster, false );
		}
		check( f.monster.v.flags & flag, 'stock QC initializer sets genuine unsupported floor policy flag: ' + classname );
		activate( f.trigger, scope.player ); SV_RunTriggerTouch( f.monster, f.trigger );
		const entity = f.monster, receiver = Array.from( f.destination.v.origin );
		nearOrigin( Array.from( entity.v.origin ), receiver, 'fly/swim arrival keeps exact QC destination instead of artificial floor snap' );
		check( entity.v.flags & flag, 'native fly/swim flag survives arrival' ); check( ! ( entity.v.flags & FL_ONGROUND ), 'unsupported floor policy does not fabricate onground support' );
		check( entity._rendVeil, 'unsupported grounding policy still uses finite ordinary arrival effect' ); nearOrigin( entity._rendVeil.origin, receiver, 'fly/swim record retains native receiver altitude' );
		entity.v.think = progs.pr_functions.indexOf( ED_FindFunction( 'SUB_Null' ) ); entity.v.nextthink = entity._rendVeil.start + .1; entity.v.velocity = [ 0, 0, 0 ];
		sv.time = entity._rendVeil.start + 2.5; SV_SetFrametime( .05 ); SV_Physics_Step( entity );
		nearOrigin( Array.from( entity.v.origin ), receiver, 'released fly/swim physics retains existing gravity exemption' ); same( entity.v.velocity[ 2 ], 0, 'released fly/swim policy creates no artificial falling speed' );
		receipts.push( { classname, nativeFlag: flag, swimmingInitializer: flag === FL_SWIM ? 'swimmonster_start' : null, origin: Array.from( entity.v.origin ), savedOrigin: entity._rendVeil.origin } );
	}
	console.log( 'REND_NATIVE_FLY_SWIM_POLICY ' + JSON.stringify( receipts ) );
} );
