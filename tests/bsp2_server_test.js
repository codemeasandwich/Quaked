// Native QC edicts + public linking and server datagram endpoint. The fixture's
// PVS contains ONLY a high leaf bit, so narrowing to16bits cannot pass by chance.
import {readFileSync} from 'node:fs';
import {BSP2,convertBsp29,widenFixture,splitBsp,joinBsp} from './helpers/bsp2_fixture.mjs';
import {COM_AddPack,COM_LoadPackFile,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init,Mod_ForName,Mod_PointInLeaf} from '../src/engine/render/gl_model.js';
import {PR_InitBuiltins} from '../src/engine/progs/pr_cmds.js';
import {PR_ExecuteProgram} from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import {ED_Alloc,ED_NewString} from '../src/engine/progs/pr_edict.js';
import {sv,svs,client_t,SOLID_BBOX} from '../src/engine/server/server.js';
import {SV_SpawnServer,SV_SendClientMessages} from '../src/engine/server/sv_main.js';
import {SV_ClearWorld,SV_LinkEdict} from '../src/engine/server/world.js';
import {net_drivers} from '../src/engine/net/net.js';
import {Cbuf_Init} from '../src/engine/common/cmd.js';
import {Cvar_FindVar,Cvar_RegisterVariable,Cvar_SetValue} from '../src/engine/common/cvar.js';
import {r_hdr} from '../src/gl_post.js';
import {skill} from '../src/engine/server/host.js';
import {sv_gravity,SV_SetPlayer} from '../src/engine/server/sv_phys.js';
import {SZ_Alloc,SZ_Clear} from '../src/engine/common/common.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
Deno.test('actual linked high-leaf entity survives expanded server fatPVS into the emitted native packet snapshot',()=>{
 const pack=readFileSync(new URL('../pak0.pak',import.meta.url));COM_AddPack(COM_LoadPackFile('wide-pvs-native',pack.buffer.slice(pack.byteOffset,pack.byteOffset+pack.length)));VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);Mod_Init();PR_InitBuiltins();Cbuf_Init();for(const v of[r_hdr,skill,sv_gravity])if(!Cvar_FindVar(v.name))Cvar_RegisterVariable(v);Cvar_SetValue('r_hdr',0);Cvar_SetValue('skill',1);svs.maxclients=1;svs.clients=[new client_t()];sv.active=false;SV_SpawnServer('e1m1');const client=svs.clients[0],player=client.edict;progs.pr_global_struct.self=progs.EDICT_TO_PROG(player);PR_ExecuteProgram(progs.pr_global_struct.SetNewParms);PR_ExecuteProgram(progs.pr_global_struct.ClientConnect);PR_ExecuteProgram(progs.pr_global_struct.PutClientInServer);
 const original=Mod_ForName('maps/b_shell0.bsp',true),point=[100,100,100],leafIndex=Mod_PointInLeaf(point,original)._leafIndex,fixture=widenFixture(convertBsp29(COM_FindFile('maps/b_shell0.bsp').data,BSP2),BSP2),highLeaf=fixture.offset+leafIndex,bit=highLeaf-1,row=(fixture.offset+fixture.originalLeaves-1+7)>>3,byte=bit>>3,rle=[];function zero(n){while(n>0){const count=Math.min(255,n);rle.push(0,count);n-=count;}}zero(byte);rle.push(1<<(bit&7));zero(row-byte-1);const lumps=splitBsp(fixture.bytes);lumps[4]=Buffer.from(rle);lumps[10].writeInt32LE(0,highLeaf*44+4);const data=joinBsp(lumps,BSP2),name='maps/public-server-wide.bsp';COM_AddPack({data:data.buffer.slice(data.byteOffset,data.byteOffset+data.length),files:[{name,filepos:0,filelen:data.length}]});const wide=Mod_ForName(name,true);sv.worldmodel=wide;sv.models[1]=wide;SV_ClearWorld();same(Mod_PointInLeaf(point,wide)._leafIndex,highLeaf,'real widened draw tree selects intended high leaf');
 for(let i=2;i<sv.num_edicts;i++)sv.edicts[i].v.modelindex=0;const target=ED_Alloc();target.v.classname=ED_NewString('wide_pvs_fixture');target.v.model=ED_NewString('progs/player.mdl');target.v.modelindex=sv.model_precache.indexOf('progs/player.mdl');check(target.v.modelindex>0,'real native model precache');target.v.origin=point;target.v.mins=[-1,-1,-1];target.v.maxs=[1,1,1];target.v.solid=SOLID_BBOX;SV_LinkEdict(target,false);check(target.num_leafs>0,'actual world linkage populated leaf references');check(Array.from(target.leafnums.subarray(0,target.num_leafs)).includes(bit),'linked edict retains leaf index above65535');player.v.origin=point;player.v.view_ofs=[0,0,0];player.v.flags=0;SV_SetPlayer(player);client.active=client.spawned=true;client.netconnection={driver:7,disconnected:false};SZ_Alloc(client.message,65536);SZ_Clear(sv.reliable_datagram);SZ_Clear(sv.datagram);
 const driver=net_drivers[7],saved={...driver},packets=[];Object.assign(driver,{CanSendUnreliableMessage:()=>true,SendUnreliableMessage:(_socket,message)=>{packets.push(Uint8Array.from(message.data.subarray(0,message.cursize)));return 1;},CanSendMessage:()=>true,SendMessage:()=>1});
 try{const sequence=client.outgoing_sequence;SV_SendClientMessages();same(packets.length,1,'actual native server datagram sent through recording transport');check(packets[0].length>0,'nonempty protocol packet');const snapshot=client.frames[sequence&(client.frames.length-1)].entities;check(snapshot.entities.slice(0,snapshot.num_entities).some(e=>e.number===target.index),'only high-bit-visible actor reaches actual packet-entities snapshot');console.log('BSP2_SERVER_PVS '+JSON.stringify({leafIndex:highLeaf,pvsBit:bit,rowBytes:row,linked:Array.from(target.leafnums.subarray(0,target.num_leafs)),entity:target.index,packetBytes:packets[0].length,visibleEntities:snapshot.num_entities}));}finally{Object.assign(driver,saved);client.active=false;sv.active=false;}
});
