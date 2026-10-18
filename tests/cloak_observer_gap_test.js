// Regression for the Operative cloak's demonstrated native protocol gap.
// Actual stock Ring pickup, native animation/CheckPowerups, production snapshot
// writer and parser. Only transport delivery is recorded; this is NOT a two-client
// multiplayer acceptance trial. The original red receipt is retained separately.
import { readFileSync } from './helpers/resource_fs.mjs';
import { createHash } from 'node:crypto';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { ED_FindFunction, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { sv, svs, client_t, coop, deathmatch, skill, set_host_client } from '../src/engine/server/server.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { SV_SpawnServer, SV_SendClientMessages, SV_SendServerinfo, SV_ConnectClient, sv_protocol } from '../src/engine/server/sv_main.js';
import { SV_CloakBodyFrame } from '../src/engine/server/sv_cloak.js';
import { SV_SetPlayer, sv_gravity } from '../src/engine/server/sv_phys.js';
import { SV_LinkEdict, SV_RunTriggerTouch } from '../src/engine/server/world.js';
import { net_drivers } from '../src/engine/net/net.js';
import { Cbuf_Init, Cmd_Init, Cmd_ExecuteString, src_client } from '../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import { SZ_Alloc, SZ_Clear, sizebuf_t, COM_SetNetMessage, MSG_WriteByte, MSG_WriteLong } from '../src/engine/common/common.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { CL_GetPredictedPlayer, CL_ResetPrediction, CL_SetValidSequence, CL_SetPlayerInfo, CL_SetServerSequence } from '../src/engine/client/cl_pred.js';
import { CL_RelinkEntities } from '../src/engine/client/cl_main.js';
import { cls, cl, cl_entities, ca_dedicated } from '../src/engine/client/client.js';
import { IT_INVISIBILITY, IT_AXE } from '../src/engine/common/quakedef.js';
import { svc_updatestat, PF_CLOAK_BODY, PF_DEAD } from '../src/engine/common/protocol.js';
import { r_hdr } from '../src/newer/render/gl_post.js';

const check = (v, message) => { if (!v) throw new Error(message); };
const call = (entity, name) => {
  progs.pr_global_struct.self = progs.EDICT_TO_PROG(entity);
  progs.pr_global_struct.time = sv.time;
  const fn = typeof name === 'string' ? progs.pr_functions.indexOf(ED_FindFunction(name)) : name;
  check(fn > 0, 'native function exists: ' + name);
  PR_ExecuteProgram(fn);
};

for (const protocol of [15, 1015]) Deno.test(`protocol ${protocol}: native Ring observers retain actual body animation and legacy eyes remain unchanged`, () => {
  const bytes = readFileSync(new URL('../games/shareware/pak0.pak', import.meta.url));
  pak.COM_AddPack(pak.COM_LoadPackFile('cloak-gap-stock', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);
  Mod_Init(); PR_InitBuiltins(); Cbuf_Init(); Cmd_Init(); Host_InitCommands();
  for (const c of [r_hdr, coop, deathmatch, skill, sv_gravity, sv_protocol]) if (!Cvar_FindVar(c.name)) Cvar_RegisterVariable(c);
  Cvar_SetValue('r_hdr', 0); Cvar_SetValue('coop', 1); Cvar_SetValue('deathmatch', 0); Cvar_SetValue('skill', 1); Cvar_SetValue('sv_protocol', protocol);
  svs.maxclients = 2; svs.clients = [new client_t(), new client_t()];
  cls.state = ca_dedicated; sv.active = false; SV_SpawnServer('e1m3');
  const [wearer, observer] = svs.clients.map(c => c.edict);
  for (const client of svs.clients) {
    const p = client.edict;
    call(p, progs.pr_global_struct.SetNewParms); call(p, progs.pr_global_struct.ClientConnect); call(p, progs.pr_global_struct.PutClientInServer);
    client.active = client.spawned = true;
    client.netconnection = {driver: 7, disconnected: false, slot: p.index, address: 'recording-only'};
    SZ_Alloc(client.message, 65536);
  }
  const ring = sv.edicts.find(e => e && !e.free && progs.PR_GetString(e.v.classname) === 'item_artifact_invisibility');
  check(ring && ring.v.touch, 'e1m3 contains its actual native Ring pickup');
  wearer.v.origin = Array.from(ring.v.origin); observer.v.origin = [ring.v.origin[0] + 40, ring.v.origin[1], ring.v.origin[2]];
  SV_LinkEdict(wearer, false); SV_LinkEdict(observer, false);
  SV_RunTriggerTouch(wearer, ring);
  check((wearer.v.items & IT_INVISIBILITY) !== 0 && (observer.v.items & IT_INVISIBILITY) === 0, 'native pickup gives only wearer the Ring');
  const timer = GetEdictFieldValue(wearer, 'invisible_finished');
  check(timer.accessor.getFloat(timer.ofs) > sv.time + 29, 'native pickup sets the 30-second timer');
  cl.maxclients = 2; cl.viewentity = 2; cl.model_precache = sv.models.slice(); cl.worldmodel = sv.worldmodel; cl.protocol = sv.protocol;
  const observerClient = svs.clients[1];
  observerClient.spawned = false; set_host_client(observerClient);
  Cmd_ExecuteString('prespawn cloakbody1', src_client);
  check(observerClient.cloakBodyCapability === true, 'existing prespawn command negotiates exact capability');
  observerClient.spawned = true; SZ_Clear(observerClient.message);
  SV_SetPlayer(observer);
  const driver = net_drivers[7], saved = {...driver}, packets = [];
  Object.assign(driver, {
    CanSendUnreliableMessage: () => true,
    SendUnreliableMessage: (socket, message) => { if (socket.slot === observer.index) packets.push(Uint8Array.from(message.data.subarray(0, message.cursize))); return 1; },
    CanSendMessage: () => true, QSendMessage: () => 1
  });
  const results = [];
  const snapshot = () => {
    SZ_Clear(sv.datagram); SZ_Clear(sv.reliable_datagram); packets.length = 0;
    SV_SetPlayer(observer); SV_SendClientMessages();
    check(packets.length === 1, 'production writer emits observer snapshot');
    const packet = new sizebuf_t(); SZ_Alloc(packet, packets[0].length + 6); packet.data.set(packets[0]); packet.cursize = packets[0].length;
    MSG_WriteByte(packet, svc_updatestat); MSG_WriteByte(packet, 31); MSG_WriteLong(packet, 12345678);
    cl.stats[31] = 0; COM_SetNetMessage(packet); CL_ParseServerMessage();
    check(cl.stats[31] === 12345678, 'optional payload preserves the following message boundary');
    return CL_GetPredictedPlayer(0);
  };
  const negotiate = (argument, expected) => {
    observerClient.spawned = false; set_host_client(observerClient);
    Cmd_ExecuteString('prespawn' + (argument ? ' ' + argument : ''), src_client);
    check(observerClient.cloakBodyCapability === expected, 'capability exact match: ' + argument);
    observerClient.spawned = true; SZ_Clear(observerClient.message);
  };
  try {
    for (const [animation, velocity] of [['player_stand1', [0, 0, 0]], ['player_run', [120, 0, 0]], ['player_shot1', [0, 0, 0]]]) {
      wearer.v.velocity = velocity;
      call(wearer, animation);
      const bodyFrame = wearer.v.frame;
      call(wearer, 'CheckPowerups');
      check(sv.model_precache[wearer.v.modelindex] === 'progs/eyes.mdl', 'native model becomes eyes');
      const state = snapshot();
      check(state && cl.model_precache[state.modelindex]?.name === 'progs/eyes.mdl', 'production client decodes remote eyes');
      results.push({animation, bodyFrame, nativeFrame: wearer.v.frame, observerFrame: state.frame, cloakBodyFrame: state.cloakBodyFrame, observerModel: cl.model_precache[state.modelindex].name, bytes: packets[0].length});
    }
    console.log('CLOAK_OBSERVER_GAP ' + JSON.stringify({pakSha256: createHash('sha256').update(bytes).digest('hex'), protocol: sv.protocol, wearer: wearer.index, observer: observer.index, nativeRing: ring.index, poses: results}));
    check(new Set(results.map(r => r.bodyFrame)).size === 3, 'native standing, running and shooting generated distinct body poses');
    check(results.every(r => r.cloakBodyFrame === r.bodyFrame && r.nativeFrame === 0 && r.observerFrame === 0), 'negotiated metadata retains actual pose while ordinary native and Classic eyes frame remain0: ' + JSON.stringify(results));
    check(!(cl.items & IT_INVISIBILITY), 'observing the wearer never changes observer inventory/Unseen World');
    wearer.v.effects = observer.v.effects = 0;
    negotiate('', false); observerClient.outgoing_sequence = 50; snapshot();
    const legacy = packets[0];
    set_host_client(observerClient); Cmd_ExecuteString('prespawn cloakbody1', src_client);
    check(observerClient.cloakBodyCapability === false, 'spawned peer cannot renegotiate by issuing prespawn during play');
    negotiate('cloakbody1', true); observerClient.outgoing_sequence = 50; snapshot();
    const modern = packets[0], width = protocol === 1015 ? 2 : 1;
    // Independent byte comparison: remove only the negotiated index and flag;
    // every other byte must match the contemporaneous legacy packet exactly.
    let exactExtensions = 0;
    for (let i = 0; i < modern.length - 4; i++) if (modern[i] === 42 && modern[i + 1] === 0 && (modern[i + 3] & 8)) {
      const cleared = Uint8Array.from(modern); cleared[i + 3] &= ~8;
      for (let at = i + 4; at <= modern.length - width; at++) {
        if (modern[at] !== 113 || (width === 2 && modern[at + 1] !== 0)) continue;
        const reduced = [...cleared.slice(0, at), ...cleared.slice(at + width)];
        if (reduced.length === legacy.length && reduced.every((byte, k) => byte === legacy[k])) exactExtensions++;
      }
    }
    check(exactExtensions === 1, 'negotiated packet differs from legacy only by PF_CLOAK_BODY and one body-frame index: ' + JSON.stringify({protocol, exactExtensions, legacy: Array.from(legacy), modern: Array.from(modern)}));
    for (let i = 0; i < 3; i++) call(wearer, 'CheckPowerups');
    check(snapshot().cloakBodyFrame === 113, 'intervening native power ticks retain last true pose instead of eyes0');
    CL_SetValidSequence(1); CL_RelinkEntities();
    check(cl_entities[1].cloakBodyFrame === 113 && cl_entities[1].frame === 0 && cl_entities[1].model.name === 'progs/eyes.mdl', 'real remote render entity keeps separate metadata and unchanged native identity');
    check(cl_entities[2].cloakBodyFrame === null, 'local camera player never becomes a remote cloak entity');

    for (const arg of ['', 'cloakbody2', 'cloakbody1 extra']) {
      negotiate(arg, false); const state = snapshot();
      check(state.cloakBodyFrame === null && state.frame === 0, 'old/unknown peers receive only ordinary eyes');
    }
    // A late observer needs no pickup history; its first capable snapshot suffices.
    CL_ResetPrediction(); negotiate('cloakbody1', true);
    check(snapshot().cloakBodyFrame === 113, 'late observer learns already-active Ring from current snapshot');
    wearer.v.weapon = IT_AXE; wearer.v.velocity = [120, 0, 0];
    const walk = GetEdictFieldValue(wearer, 'walkframe'); walk.accessor.setFloat(walk.ofs, 0);
    call(wearer, 'player_run'); check(wearer.v.frame === 0, 'native axe run has legitimate body frame0');
    call(wearer, 'CheckPowerups'); check(snapshot().cloakBodyFrame === 0, 'body frame0 is distinct from absent cloak metadata');

    // Both powers come from the real item touch. SUB_regen is the native item
    // respawn route, advanced here instead of making a browser wait for it.
    call(ring, 'SUB_regen'); SV_RunTriggerTouch(observer, ring);
    call(observer, 'player_shot1'); call(observer, 'CheckPowerups'); snapshot();
    check(CL_GetPredictedPlayer(0).cloakBodyFrame === 0 && CL_GetPredictedPlayer(1).cloakBodyFrame === 113, 'two Ring wearers carry independent poses');
    check(cl.items & IT_INVISIBILITY, 'own real Ring still reaches local inventory/Unseen World independently');
    timer.accessor.setFloat(timer.ofs, sv.time); call(wearer, 'CheckPowerups');
    check(snapshot().cloakBodyFrame === 0 && (wearer.v.items & IT_INVISIBILITY), 'exact timer equality remains active as native CheckPowerups requires');
    timer.accessor.setFloat(timer.ofs, sv.time - .01); call(wearer, 'CheckPowerups');
    check(snapshot().cloakBodyFrame === null && CL_GetPredictedPlayer(1).cloakBodyFrame === 113, 'expiry clears only one wearer, including native one-tick eyes restoration delay');
    call(wearer, 'CheckPowerups'); check(sv.model_precache[wearer.v.modelindex] === 'progs/player.mdl', 'native expiry restores normal body');
    call(observer, 'ClientKill'); snapshot();
    check(!(observer.v.items & IT_INVISIBILITY) && CL_GetPredictedPlayer(1).cloakBodyFrame === null && (CL_GetPredictedPlayer(1).flags & PF_DEAD), 'native death clears cloak and restores dead-player snapshot');
    call(observer, progs.pr_global_struct.PutClientInServer);
    observer.v.origin = Array.from(wearer.v.origin); SV_LinkEdict(observer, false);
    check(snapshot().cloakBodyFrame === null && CL_GetPredictedPlayer(1).cloakBodyFrame === null, 'native respawn does not resurrect cloak');

    call(ring, 'SUB_regen'); SV_RunTriggerTouch(wearer, ring); call(wearer, 'player_shot1'); call(wearer, 'CheckPowerups');
    check(snapshot().cloakBodyFrame === 113, 'subsequent native acquisition restores cloak');
    const bodyIndex = sv.model_precache.indexOf('progs/player.mdl'), bodyModel = sv.models[bodyIndex];
    sv.models[bodyIndex] = null;
    check(snapshot().cloakBodyFrame === null, 'missing body asset safely retains native eyes without metadata');
    sv.models[bodyIndex] = bodyModel;
    const crc = progs.pr_crc; progs.PR_SetCRC(0);
    check(snapshot().cloakBodyFrame === null, 'unsupported game code cannot invent a body pose');
    progs.PR_SetCRC(crc);
    check(SV_CloakBodyFrame(ring) === null, 'unrelated entities never qualify as remote players');
    const beforeItems = wearer.v.items; wearer.v.items &= ~IT_INVISIBILITY;
    check(snapshot().cloakBodyFrame === null, 'authoritative item removal clears metadata even with stale eyes model/timer');
    wearer.v.items = beforeItems;
    check(snapshot().cloakBodyFrame === 113, 'independent identity restores only when authority agrees');
    svs.clients[0].active = false; snapshot(); CL_SetValidSequence(1); CL_RelinkEntities();
    check(CL_GetPredictedPlayer(0) === null && cl_entities[1].cloakBodyFrame === null, 'absent/disconnected player leaves no current snapshot or render cloak');
    svs.clients[0].active = true;
    set_host_client(svs.clients[0]); SV_ConnectClient(0);
    check(svs.clients[0].cloakBodyCapability === false && SV_CloakBodyFrame(wearer) === null, 'reused connection slot clears capability and retained pose');
    SV_SendServerinfo(observerClient);
    check(observerClient.cloakBodyCapability === false, 'new map signon must negotiate again');
    CL_ResetPrediction(); check(CL_GetPredictedPlayer(0) === null && CL_GetPredictedPlayer(1) === null, 'disconnect/map prediction reset invalidates old players');
    const model = sv.model_precache.indexOf('progs/eyes.mdl'), zero = new Float32Array(3);
    CL_SetServerSequence(12); CL_SetPlayerInfo(0, zero, zero, 0, PF_CLOAK_BODY | PF_DEAD, 0, 0, 0, 0, null, model, 14);
    check(CL_GetPredictedPlayer(0).cloakBodyFrame === null, 'dead flag rejects even a contradictory cloak payload');
    CL_SetPlayerInfo(0, zero, zero, 0, 0, 0, 0, 0, 0, null, model, 14);
    check(CL_GetPredictedPlayer(0).cloakBodyFrame === null, 'payload without explicit flag is not a cloak');
    CL_SetPlayerInfo(0, zero, zero, 0, PF_CLOAK_BODY, 0, 0, 0, 0, null, bodyIndex, 14);
    check(CL_GetPredictedPlayer(0).cloakBodyFrame === null, 'ordinary player model cannot become cloaked from contradictory metadata');
    CL_SetServerSequence(13); check(CL_GetPredictedPlayer(0) === null, 'old snapshot cannot resurrect metadata');
    const oldWorld = sv.edicts;
    svs.clients.forEach(c => { c.active = false; }); sv.active = false;
    SV_SpawnServer('e1m3');
    check(sv.edicts !== oldWorld && SV_CloakBodyFrame(wearer) === null, 'actual map load invalidates former edict/program pose ownership');
  } finally {
    Object.assign(driver, saved); svs.clients.forEach(c => { c.active = false; }); sv.active = false;
  }
});
