// End-to-end native LAN transport gameplay regression, adapted from
// window_play_native_test.js. Requires the compiled test-only Rust example via
// QUAKED_LAN_TEST_BRIDGE. Uses real TCP between three subprocesses and the actual
// engine/QuakeC server. This is not a WKWebView or two-physical-Mac UI trial.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assetPath } from '../tools/distribution/manifest.mjs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, skill } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { Host_ServerFrame } from '../src/engine/server/host.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { set_host_frametime } from '../src/engine/common/host_state.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init, Cmd_ExecuteString } from '../src/engine/common/cmd.js';
import { sizebuf_t, SZ_Alloc, SZ_Clear, MSG_WriteByte, MSG_WriteString, MSG_WriteFloat, MSG_WriteAngle, MSG_WriteShort } from '../src/engine/common/common.js';
import { clc_stringcmd, clc_move } from '../src/engine/common/protocol.js';
import { cls, ca_dedicated } from '../src/engine/client/client.js';
import * as net from '../src/engine/net/net_main.js';
import * as netState from '../src/engine/net/net.js';
import { Window_Host, Window_SetChannelFactory } from '../src/engine/net/net_window.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const tick = ( ms = 5 ) => new Promise( resolve => setTimeout( resolve, ms ) );

const raw = readFileSync(assetPath(fileURLToPath(new URL('../',import.meta.url)), 'games/shareware/pak0.pak'));
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
Cbuf_Init(); Cmd_Init(); Mod_Init(); PR_InitBuiltins(); Host_InitCommands(); SV_Init();
for ( const c of [ deathmatch, coop, teamplay, skill ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c ); // the server's own (Host_InitLocal registers them in the page)
svs.maxclientslimit = 4; svs.clients = Array.from( { length: 4 }, () => new client_t() );
net.NET_Init();

// Use three separate native transport processes, one for the host and one per
// remote client. The channel glue is test infrastructure, not the app's Tauri IPC
// adapter; actual Quake signon/server frames and the production Rust wire run here.
let hostBridge, hostAddress, bridges = [], channels = [], transportErrors = [];
const fingerprint = 'test-engine:quake:' + createHash('sha256').update(raw).digest('hex');
class Bridge {
 constructor() {
  const executable=process.env.QUAKED_LAN_TEST_BRIDGE;
  if(!executable)throw Error('Set QUAKED_LAN_TEST_BRIDGE to the compiled lan_test_bridge example');
  this.sequence=0;this.pending=new Map();this.closed=false;this.stderr='';
  this.process=spawn(executable,[],{stdio:['pipe','pipe','pipe']});
  this.process.stderr.on('data',chunk=>{this.stderr=(this.stderr+chunk).slice(-4096);});
  this.lines=createInterface({input:this.process.stdout});
  this.lines.on('line',line=>{
   let reply;try{reply=JSON.parse(line);}catch(error){this.fail(error);return;}
   const pending=this.pending.get(reply.id);if(!pending)return;
   this.pending.delete(reply.id);clearTimeout(pending.timer);
   if(reply.ok)pending.resolve(reply.result);else pending.reject(Error(reply.error));
  });
  this.process.on('error',error=>this.fail(error));
  this.exit=new Promise(resolve=>this.process.once('close',(code,signal)=>{this.closed=true;this.fail(Error(`LAN bridge exited ${code??signal}: ${this.stderr}`));resolve();}));
 }
 fail(error){for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();}
 request(command,fields={}){
  if(this.closed)return Promise.reject(Error('LAN bridge is closed'));
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('LAN bridge command timed out: '+command));},8000);
   this.pending.set(id,{resolve,reject,timer});
   this.process.stdin.write(JSON.stringify({id,command,...fields})+'\n',error=>{
    if(!error)return;const pending=this.pending.get(id);if(pending){clearTimeout(pending.timer);this.pending.delete(id);pending.reject(error);}
   });
  });
 }
 async close(){
  if(!this.closed){try{await this.request('quit');}catch{this.process.kill();}this.process.stdin.end();}
  await this.exit;this.lines.close();
 }
}
function nativeChannel(session,id){
 check(session==='lan','only the reserved native session uses this adapter');
 const bridge=id==='host'?hostBridge:new Bridge();if(id!=='host')bridges.push(bridge);
 const ready=id==='host'?Promise.resolve():bridge.request('join',{address:hostAddress,fingerprint,peer:id});
 let closed=false,timer=null,polling=null,sending=Promise.resolve();
 const channel={onmessage:null,
  postMessage(message){
   const copy={...message};if(message.b)copy.b=Array.from(message.b);
   sending=sending.then(()=>ready).then(()=>closed?null:bridge.request('send',{message:copy})).catch(error=>{
    // A queued message to a peer that already left must not kill the host's
    // other sockets. Record other errors rather than silently swallowing them.
    if(!closed&&!(id==='host'&&/disconnected|Broken pipe|reset by peer/i.test(String(error))))transportErrors.push(error);
   });
  },
  close(){closed=true;clearTimeout(timer);},
  async drain(){channel.close();await Promise.allSettled([sending,polling,ready]);}
 };
 const poll=async()=>{
  try{await ready;if(closed)return;const messages=await bridge.request('poll');
   for(const message of messages){if(closed)return;if(message.b)message.b=Uint8Array.from(message.b);channel.onmessage?.({data:message});}
  }catch(error){if(!closed)transportErrors.push(error);return;}
  if(!closed)timer=setTimeout(()=>{polling=poll();},2);
 };
 polling=poll();channels.push(channel);return channel;
}
const closeAll = async () => {
 for ( let s = netState.net_activeSockets; s; ) { const next = s.next; net.NET_Close( s ); s = next; }
 Window_Host(null);
 // Engine channels deliberately linger three seconds after close. Close our
 // test channels now and wait out those existing timers before Deno sanitizes.
 await Promise.all(channels.map(channel=>channel.drain()));
 await Promise.all(bridges.map(bridge=>bridge.close()));
 Window_SetChannelFactory(null);await tick(3100);
};
const test = (name,fn) => Deno.test(name,async()=>{
 try {
  hostBridge=new Bridge();bridges=[hostBridge];
  hostAddress=await hostBridge.request('host',{address:'127.0.0.1:0',fingerprint});
  Window_SetChannelFactory(nativeChannel);
  await fn();check(transportErrors.length===0,'transport errors: '+transportErrors.map(String).join('; '));
 } finally {await closeAll();}
});

// one player's window: its socket and what it sends
function player( sock ) {

	const out = new sizebuf_t(); SZ_Alloc( out, 1024 );
	return {
		sock,
		say( text ) { SZ_Clear( out ); MSG_WriteByte( out, clc_stringcmd ); MSG_WriteString( out, text ); same( net.NET_SendMessage( sock, out ), 1, 'sent ' + text ); },
		move( forward, yaw ) { SZ_Clear( out ); MSG_WriteByte( out, clc_move ); MSG_WriteFloat( out, sv.time ); MSG_WriteAngle( out, 0 ); MSG_WriteAngle( out, yaw ); MSG_WriteAngle( out, 0 );
			MSG_WriteShort( out, forward ); MSG_WriteShort( out, 0 ); MSG_WriteShort( out, 0 ); MSG_WriteByte( out, 0 ); MSG_WriteByte( out, 0 ); net.NET_SendUnreliableMessage( sock, out ); },
		drain() { let n = 0; while ( net.NET_GetMessage( sock ) > 0 ) n ++; return n; } // the server's messages, read and set aside
	};

}

async function frames( n, each = () => {} ) {

	for ( let i = 0; i < n; i ++ ) { each(); await tick(); Host_ServerFrame(); await tick(); }

}

test( 'two remote TCP clients join the native Quake server; movement, death and disconnect remain isolated', async () => {

	cls.state = ca_dedicated; // this page runs only the server: no local client of its own
	vars.Cvar_Set( 'coop', '1' ); vars.Cvar_Set( 'deathmatch', '0' ); vars.Cvar_Set( 'skill', '1' );
	svs.maxclients = 2;
	SV_SpawnServer( 'e1m1' );
	check( sv.active, 'the server runs e1m1' );
	set_host_frametime( 0.05 );
	const session = 'lan';
	check( Window_Host( session ), 'the page hosts a session' );
	Cmd_ExecuteString( 'listen 1' ); // as `maxplayers 2` does
	const joins = [ net.NET_Connect( 'window:' + session ), net.NET_Connect( 'window:' + session ) ];
	await frames( 40 );
	const socks = await Promise.all( joins );
	same( svs.clients.filter( c => c.active ).length, 2, 'the server took both windows as clients' );
	const players = socks.map( player );

	for ( const step of [ 'prespawn', 'spawn', 'begin' ] ) { players.forEach( ( p, i ) => { if ( step === 'spawn' ) p.say( 'name "Player ' + ( i + 2 ) + '"' ); p.say( step ); } ); await frames( 8, () => players.forEach( p => p.drain() ) ); }
	// Separate TCP subprocesses can connect in either order. Correlate each
	// player's server edict with its actual transport peer, never slot order.
	const [ a, b ] = socks.map( sock => svs.clients.find( client =>
		client.active && client.netconnection?.driverdata?.peer === sock.driverdata.id ) );
	check( a && b && a !== b, 'each remote socket maps to a distinct server client by peer identity' );
	check( a.spawned && b.spawned, 'both players are in the game after the native signon' );
	check( a.edict !== b.edict && a.edict.v.health > 0 && b.edict.v.health > 0, 'each has a live player edict of its own' );
	same( a.name + '|' + b.name, 'Player 2|Player 3', 'and their own names' );

	const start = [ Array.from( a.edict.v.origin ), Array.from( b.edict.v.origin ) ];
	await frames( 20, () => { players[ 0 ].move( 320, 0 ); players[ 1 ].move( 0, 90 ); players.forEach( p => p.drain() ); } );
	const moved = ( e, s ) => Math.hypot( e.v.origin[ 0 ] - s[ 0 ], e.v.origin[ 1 ] - s[ 1 ] );
	check( moved( a.edict, start[ 0 ] ) > 16, 'the first window\'s forward move moves its player: ' + moved( a.edict, start[ 0 ] ).toFixed( 1 ) );
	check( moved( b.edict, start[ 1 ] ) < 1, 'the second player, told to stand, stands: ' + moved( b.edict, start[ 1 ] ).toFixed( 1 ) );
	check( Math.abs( b.edict.v.v_angle[ 1 ] - 90 ) < 2 && Math.abs( a.edict.v.v_angle[ 1 ] ) < 2, 'each aims where its own window says' );

	players[ 1 ].say( 'kill' );
	await frames( 8, () => players.forEach( p => p.drain() ) );
	// QuakeC's ClientKill: the player dies, loses two frags and respawns at once
	same( b.edict.v.frags, - 2, 'the second player\'s kill is that player\'s suicide' );
	same( a.edict.v.frags, 0, 'and not the first player\'s' );
	check( a.edict.v.health > 0 && b.edict.v.health > 0, 'both are alive again' );

	net.NET_Close( socks[ 1 ] );
	await frames( 8, () => players[ 0 ].drain() );
	check( ! b.active, 'closing the second window drops that player' );
	check( a.active && a.spawned && a.edict.v.health > 0, 'the first plays on' );

	// ending with a free slot: the shutdown message goes to the one player at once, not after the 5 s block
	const shutdown = new sizebuf_t(); SZ_Alloc( shutdown, 16 ); MSG_WriteByte( shutdown, 1 ); // svc_nop
	const began = performance.now();
	same( net.NET_SendToAll( shutdown, 5 ), 0, 'every connected player got it' );
	check( performance.now() - began < 2000, 'without waiting out the 5 s block on the empty slot: ' + Math.round( performance.now() - began ) + ' ms' );

	net.NET_Close( socks[ 0 ] );
	await frames( 8 );
	check( ! a.active, 'and the last leaves' );
	Window_Host( null );
	sv.active = false;

} );
