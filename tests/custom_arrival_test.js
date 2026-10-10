// Actual native server, reciprocal loopback sockets, public renderer new-map,
// client command and host physics endpoints. GPU readiness remains a browser test.
import {readFileSync} from 'node:fs';
import {COM_AddPack,COM_LoadPackFile,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init} from '../src/engine/render/gl_model.js';
import {PR_InitBuiltins} from '../src/engine/server/pr_cmds.js';
import {PR_ExecuteProgram} from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import {sv,svs,client_t,FL_ONGROUND} from '../src/engine/server/server.js';
import {SV_Init,SV_SpawnServer} from '../src/engine/server/sv_main.js';
import * as host from '../src/engine/server/host.js';
import * as client from '../src/engine/client/cl_main.js';
import {cl,cls,ca_connected,ca_disconnected} from '../src/engine/client/client.js';
import * as main from '../src/engine/render/gl_rmain.js';
import {R_DrawWorld,R_DemonReliefStatus} from '../src/engine/render/gl_rsurf.js';
import * as newerMode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import * as boot from '../src/newer/ui/r_demoloading.js';
import {R_DemonBakeStatus} from '../src/newer/assets/r_demonbakes.js';
import {NET_Init,NET_Connect,NET_CheckNewConnections,NET_Shutdown} from '../src/engine/net/net_main.js';
import {Cbuf_Init,Cmd_Init} from '../src/engine/common/cmd.js';
import {set_key_dest,key_game} from '../src/engine/client/keys.js';
import {SZ_Clear,MSG_WriteByte} from '../src/engine/common/common.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
Deno.test('actual paired Newer arrivals hold native time/input before preparation; Classic, recorded, network and stale peers never acquire the hold',()=>{
 const pack=readFileSync(new URL('../games/shareware/pak0.pak',import.meta.url));COM_AddPack(COM_LoadPackFile('custom-arrival-native',pack.buffer.slice(pack.byteOffset,pack.byteOffset+pack.length)));VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();Cbuf_Init();Cmd_Init();client.CL_Init();SV_Init();main.R_Init();svs.maxclients=svs.maxclientslimit=1;svs.clients=[new client_t()];NET_Init();vars.Cvar_SetValue('r_hdr',1);sv.active=false;SV_SpawnServer('e1m1');const serverClient=svs.clients[0],p=serverClient.edict;progs.pr_global_struct.self=progs.EDICT_TO_PROG(p);PR_ExecuteProgram(progs.pr_global_struct.SetNewParms);PR_ExecuteProgram(progs.pr_global_struct.ClientConnect);PR_ExecuteProgram(progs.pr_global_struct.PutClientInServer);const local=NET_Connect('local'),peer=NET_CheckNewConnections();check(local&&peer&&local.driverdata===peer&&peer.driverdata===local,'real native loopback pair');serverClient.netconnection=peer;serverClient.active=true;serverClient.spawned=false;cls.netcon=local;cls.state=ca_connected;cls.signon=4;cls.demoplayback=false;cl.worldmodel=sv.worldmodel;cl.model_precache=sv.models.slice();cl.maxclients=1;cl.movemessages=4;set_key_dest(key_game);host.set_host_frametime(.02);
 function reset(){boot.R_DemoLoadingCancel();vars.Cvar_SetValue('r_hdr',1);newerMode.R_AnimSetClassicPass(false);newerMode.R_AnimSetNewer(false);sv.active=true;svs.maxclients=1;serverClient.active=true;serverClient.netconnection=peer;cls.netcon=local;cls.state=ca_connected;cls.demoplayback=cls.timedemo=false;local.driver=0;local.disconnected=peer.disconnected=false;local.driverdata=peer;peer.driverdata=local;}
 try{
  reset();main.R_NewMap();check(boot.R_WelcomeLoadingHolding(),'new current mode admits before stale animation flag turns Newer');check(R_DemonBakeStatus().pending>0,'current map preparation remains a real outstanding prerequisite');R_DrawWorld();const sculptStatus=R_DemonReliefStatus();check(sculptStatus.preparedPending>0,'actual renderer status includes custom preparation beyond visible surface count');check(boot.R_IntroReadinessChecks({demon:sculptStatus}).pending.includes('sculpted surfaces'),'actual renderer status still holds the public readiness collector');serverClient.spawned=true;serverClient.cmd={forwardmove:0,sidemove:0,upmove:0};p.v.flags=(p.v.flags|0)|FL_ONGROUND;p.v.velocity=[160,0,0];const heldVelocity=Array.from(p.v.velocity);const time=sv.time,origin=Array.from(p.v.origin),moves=cl.movemessages;SZ_Clear(cls.message);MSG_WriteByte(cls.message,1);client.CL_SendCmd();same(cl.movemessages,moves,'actual client movement generation blocked');same(cls.message.cursize,0,'actual reliable preparation still sends');check(peer.receiveMessageLength>0,'native loopback received reliable packet while movement held');host.Host_ServerFrame();same(sv.time,time,'actual native world clock held');same(JSON.stringify(Array.from(p.v.origin)),JSON.stringify(origin),'actual player physics position held');same(JSON.stringify(Array.from(p.v.velocity)),JSON.stringify(heldVelocity),'already-spawned client movement/friction stays frozen too');check(peer.receiveMessageLength===0,'native server still consumes reliable messages');
  boot.R_DemoLoadingCancel();host.Host_ServerFrame();check(Math.abs(sv.time-time-.02)<1e-8,'normal native physics resumes after cancellation');check(p.v.velocity[0]<heldVelocity[0],'normal client friction resumes after the hold ends');const resumedVelocity=Array.from(p.v.velocity);client.CL_SendCmd();same(cl.movemessages,moves+1,'same public client movement path resumes');peer.receiveMessageLength=0;local.receiveMessageLength=0;
  const cases=[['Classic',()=>vars.Cvar_SetValue('r_hdr',0)],['recorded demo',()=>cls.demoplayback=true],['timed demo',()=>{cls.demoplayback=true;cls.timedemo=true;}],['network transport',()=>local.driver=1],['closed client',()=>local.disconnected=true],['closed peer',()=>peer.disconnected=true],['unpaired client',()=>local.driverdata=null],['nonreciprocal peer',()=>peer.driverdata={}],['stale server slot',()=>serverClient.netconnection={}],['inactive client',()=>serverClient.active=false],['inactive server',()=>sv.active=false],['multiplayer',()=>svs.maxclients=2],['disconnected client',()=>cls.state=ca_disconnected]];
  for(const [label,change]of cases){reset();change();main.R_NewMap();check(!boot.R_WelcomeLoadingHolding(),label+' retains established timing scope');}
  reset();main.R_NewMap();check(boot.R_WelcomeLoadingHolding(),'later valid arrival rearms');sv.active=false;client.CL_Disconnect();same(R_DemonBakeStatus().pending,0,'actual bare disconnect releases owned custom work');check(!boot.R_WelcomeLoadingHolding(),'actual bare disconnect retires welcome hold');same(cls.state,ca_disconnected,'real native client disconnected');serverClient.active=false;
  boot.R_DemoLoadingBoot();client.CL_Disconnect();same(boot.R_DemoLoadingStatus().phase,'armed','bare disconnected cleanup does not cancel fresh attract boot');console.log('CUSTOM_NATIVE_ARRIVAL '+JSON.stringify({map:sv.name,heldTime:time,resumedTime:sv.time,heldVelocity,resumedVelocity,rendererPreparation:{eligible:sculptStatus.eligible,pending:sculptStatus.pending,preparedPending:sculptStatus.preparedPending,enabled:sculptStatus.enabled},scopeControls:cases.map(c=>c[0]),loopback:true}));
 }finally{serverClient.active=false;sv.active=false;boot.R_DemoLoadingCancel();NET_Shutdown();}
});
