// Native host commands, paired loopback, QC death and collision-driven seamless
// travel. Only localStorage is isolated; no real user save slot is touched.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_PointInLeaf } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { ED_FindFunction } from '../src/engine/progs/pr_edict.js';
import { sv, svs, client_t, set_host_client, skill } from '../src/engine/server/server.js';
import { SV_CheckForNewClients } from '../src/engine/server/sv_main.js';
import { SV_PushEntity, SV_SetPlayer, SV_SetFrametime, SV_Physics_Client, sv_gravity } from '../src/engine/server/sv_phys.js';
import { SV_LinkEdict } from '../src/engine/server/world.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { CL_Init, CL_Disconnect_f } from '../src/engine/client/cl_main.js';
import { cls, cl, ca_disconnected } from '../src/engine/client/client.js';
import { NET_Init, NET_SendMessage, NET_GetMessage, NET_CanSendMessage } from '../src/engine/net/net_main.js';
import { SZ_Clear } from '../src/engine/common/common.js';
import { R_Init, R_SetupFrame, scene } from '../src/engine/render/gl_rmain.js';
import { V_Init } from '../src/engine/client/view.js';
import { r_refdef } from '../src/engine/render/render.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import { R_DemoLoadingCancel } from '../src/newer/ui/r_demoloading.js';
import { sv_respawnguard } from '../src/newer/gameplay/sv_respawn.js';
import { weaponSurface, weaponKey, WeaponSurfaceState, R_WeaponSurfaceContext, R_PlayerSurfaceBlood, R_WeaponSurfaceBloodAt } from '../src/newer/render/r_weapon_surface.js';

const check = ( value, label ) => { if ( !value ) throw Error( label ); };
const same = ( actual, expected, label ) => check( actual === expected, `${label}: ${actual} !== ${expected}` );
const near = ( actual, expected, label ) => check( Math.abs( actual-expected ) < 1e-8, `${label}: ${actual} !== ${expected}` );
const text = index => progs.PR_GetString( index );
const snapshot = () => JSON.stringify( weaponSurface.snapshot() );
const coat = () => JSON.stringify( { blood: weaponSurface.blood, serial: weaponSurface.serial, spots: weaponSurface.spots.map( s => s.toArray() ) } );
const bytes = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset+bytes.byteLength ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); cmd.Cbuf_Init(); cmd.Cmd_Init(); CL_Init(); R_Init(); V_Init(); Host_InitCommands();
for ( const variable of [ skill, sv_gravity, travel.sv_seamless ] ) if ( !vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
svs.maxclients = svs.maxclientslimit = 1; svs.clients = [ new client_t() ]; NET_Init(); cls.state = ca_disconnected; cls.demoplayback = false;

function acknowledge() {
 const client = svs.clients[0];
 if ( client?.active && client.netconnection && cls.netcon && !cls.netcon.disconnected && client.message.cursize && NET_CanSendMessage( client.netconnection ) ) {
  NET_SendMessage( client.netconnection, client.message ); NET_GetMessage( cls.netcon ); SZ_Clear( client.message );
 }
}
function finishConnect() {
 SV_CheckForNewClients(); const client = svs.clients[0];
 check( client.active && client.netconnection && cls.netcon?.driverdata === client.netconnection, 'real native loopback endpoints are paired' );
 set_host_client( client ); SV_SetPlayer( client.edict ); cmd.Cmd_ExecuteString( 'spawn', cmd.src_client ); cmd.Cmd_ExecuteString( 'begin', cmd.src_client );
 // Host spawn/begin are the real server signon commands. This CPU fixture
 // acknowledges their packets and exposes an active client frame without GL.
 cls.signon = 4; cl.intermission = 0; acknowledge(); R_DemoLoadingCancel();
 check( client.edict.v.health > 0 && text( client.edict.v.classname ) === 'player', 'native QC spawn initialized a live player' );
 return client.edict;
}
async function command( value ) { acknowledge(); cmd.Cmd_ExecuteString( value, cmd.src_command ); await Promise.resolve(); return finishConnect(); }
async function fresh( map = 'e1m1' ) { vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'skill', 2 ); /* Hard: this test is about the blood coating through a full-health respawn; Normal's reduced health is tested in respawn_health_native_test.js, and the guard monster is off here (respawn_guard_native_test.js) */ sv_respawnguard.value = 0; vars.Cvar_SetValue( 'sv_seamless', 1 ); return command( 'map '+map ); }
function frame( point, time = sv.time, paused = false ) {
 // V_CalcRefdef draws the weapon named by STAT_WEAPON, which the server sets from the player's weaponmodel ("" when
 // dead). This CPU fixture does not parse client packets, so it reads the same field from the native player edict.
 const weapon = svs.clients[0]?.edict ? text( svs.clients[0].edict.v.weaponmodel ) : '';
 cl.viewent.model = weapon ? { name: weapon } : null;
 cl.worldmodel = sv.worldmodel; cl.time = time; cl.paused = paused; r_refdef.vieworg.set( point ); r_refdef.viewangles.set( [0,0,0] ); R_SetupFrame();
}
function eye( player ) { return Array.from( player.v.origin, ( value, i ) => value + player.v.view_ofs[i] ); }
function waterPoint() {
 for ( const leaf of sv.worldmodel.leafs ) if ( leaf?.contents === -3 ) {
  const b = leaf.minmaxs;
  for ( const weight of [.5,.25,.75] ) { const point = [0,1,2].map( k => b[k]*(1-weight)+b[k+3]*weight ); if ( Mod_PointInLeaf( point, sv.worldmodel ).contents === -3 ) return point; }
 }
 throw Error( 'native map has no verified water witness' );
}
function wetBlood( player, time = sv.time ) {
 const water = waterPoint(), air = eye( player ); same( Mod_PointInLeaf( air, sv.worldmodel ).contents, -1, 'native player eye is in air' );
 frame( water, time ); same( weaponSurface.blood, 0, 'real underwater renderer frame washes blood' );
 frame( air, time+.1 ); near( weaponSurface.wet, 1, 'real water exit soaks held surface' );
 check( R_PlayerSurfaceBlood( 22 ), 'actual active player surface accepts blood event' ); frame( air, time+.6 );
 check( weaponSurface.blood > 0 && weaponSurface.wet > 0 && weaponSurface.wet < 1 && weaponSurface.spots.some( s => s.w > 0 ), 'persistent spots and drying wetness both present' );
 sv.time = time+.6; return { air, water };
}
async function isolatedSaves( fn ) {
 const descriptor = Object.getOwnPropertyDescriptor( globalThis, 'localStorage' ), storage = new Map();
 Object.defineProperty( globalThis, 'localStorage', { configurable:true, value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)} } );
 try { await fn( storage ); } finally { acknowledge(); CL_Disconnect_f(); if ( descriptor ) Object.defineProperty( globalThis, 'localStorage', descriptor ); else delete globalThis.localStorage; }
}

Deno.test( 'real Host save/load atomically roundtrips blood spots and wet state, then actual air frames dry only the wet film', async () => isolatedSaves( async storage => {
 let player = await fresh(); const { air, water } = wetBlood( player, sv.time+5 ), saved = snapshot(), savedCoat = coat(), savedWet = weaponSurface.wet;
 acknowledge(); cmd.Cmd_ExecuteString( 'save model_surface_native', cmd.src_command );
 const data = storage.get( 'quake_save_model_surface_native' ); check( data?.startsWith('5\n'), 'actual native version5 save produced' );
 const line = data.split('\n').find( l => l.startsWith('// weapon-surface ') ); check( line, 'atomic native save contains coating sidecar' ); same( JSON.stringify(JSON.parse(atob(line.slice('// weapon-surface '.length)))), JSON.stringify( { version: 2, body: weaponSurface.body.snapshot(), weapons: { [ weaponKey() ]: JSON.parse( saved ) } } ), 'host serialized the body and the exact held coating, filed under the weapon drawn' );
 frame( water, sv.time+10 ); same( weaponSurface.blood, 0, 'control proves live coating changed before reload' );
 player = await command( 'load model_surface_native' ); same( snapshot(), saved, 'full native load and server signon restore every coating field' ); near( weaponSurface.last, sv.time, 'restore clock rebased to actual saved server time' );
 frame( eye(player), sv.time ); same( snapshot(), saved, 'first renderer frame after load has no artificial drying step' );
 frame( eye(player), sv.time+1 ); near( weaponSurface.wet, savedWet-.25, 'one native game second dries one quarter of wet film' ); same( coat(), savedCoat, 'blood and spot coverage do not age away' );
 frame( eye(player), sv.time+10 ); same( weaponSurface.wet, 0, 'film naturally dries completely' ); same( coat(), savedCoat, 'blood survives complete drying' );
 console.log('MODEL_SURFACE_NATIVE_SAVE '+JSON.stringify({map:sv.name,savedWet,blood:weaponSurface.blood,spots:weaponSurface.spots.filter(s=>s.w>0).length,waterWitness:water,airWitness:air,paired:cls.netcon.driverdata===svs.clients[0].netconnection}));
} ) );

Deno.test( 'real Host save/load keeps each weapon\'s own blood: the weapon in hand and one put away both come back', async () => isolatedSaves( async storage => {
 let player = await fresh(); const { air } = wetBlood( player, sv.time+5 ); const held = weaponKey();
 check( held === 'progs/v_shot.mdl', 'the native start holds the shotgun model: '+held );
 const heldCoat = coat(), nail = { name: 'progs/v_nail.mdl' };
 cl.viewent.model = nail; same( weaponSurface.blood, 0, 'a different weapon starts clean' );
 check( R_PlayerSurfaceBlood( 12 ), 'blood event reaches the other weapon' ); const otherCoat = coat(); check( otherCoat !== heldCoat, 'the two weapons carry different coatings' );
 frame( air ); same( weaponKey(), held, 'the next frame draws the native weapon again' ); same( coat(), heldCoat, 'and shows its coating before saving' );
 acknowledge(); cmd.Cmd_ExecuteString( 'save model_surface_two_weapons', cmd.src_command );
 const line = storage.get( 'quake_save_model_surface_two_weapons' ).split( '\n' ).find( l => l.startsWith( '// weapon-surface ' ) );
 same( Object.keys( JSON.parse( atob( line.slice( '// weapon-surface '.length ) ) ).weapons ).sort().join(), 'progs/v_nail.mdl,progs/v_shot.mdl', 'the save carries both bloody weapons by model' );
 weaponSurface.restoreAll( { version: 2, body: new WeaponSurfaceState().snapshot(), weapons: {} }, sv.time ); same( weaponSurface.blood, 0, 'control: coatings cleared before loading' );
 player = await command( 'load model_surface_two_weapons' ); frame( eye( player ), sv.time );
 same( weaponKey(), held, 'the loaded player holds the same weapon' ); same( coat(), heldCoat, 'the weapon in hand has its blood after the load' );
 cl.viewent.model = nail; same( coat(), otherCoat, 'the weapon put away has its own blood after the load' );
} ) );

Deno.test( 'old native saves without coating metadata retain current blood and film across load and the first renderer frame', async () => isolatedSaves( async storage => {
 let player = await fresh(); wetBlood( player, 100 ); acknowledge(); cmd.Cmd_ExecuteString('save model_surface_old_source',cmd.src_command);
 const original = storage.get('quake_save_model_surface_old_source'); check(original?.includes('// weapon-surface '),'source save has metadata to remove');
 storage.set('quake_save_model_surface_legacy', original.split('\n').filter(line=>!line.startsWith('// weapon-surface ')).join('\n'));
 // A legacy save can advance the level clock as well as rewind it. Its lack
 // of cosmetic metadata must not turn that clock jump into seconds of drying.
 player = await fresh(); wetBlood( player, sv.time+1 ); const kept = snapshot(), keptBody = JSON.stringify( weaponSurface.body.snapshot() );
 player = await command('load model_surface_legacy'); same(snapshot(),kept,'legacy load leaves current coating intact');
 frame(eye(player),sv.time); same(snapshot(),kept,'first legacy-load frame preserves coating rather than applying saved clock jump'); same(JSON.stringify(weaponSurface.body.snapshot()),keptBody,'the body coating is rebased too: no drying step from the clock jump');
 console.log('MODEL_SURFACE_LEGACY_LOAD '+JSON.stringify({time:sv.time,blood:weaponSurface.blood,wet:weaponSurface.wet}));
} ) );

Deno.test( 'native player death/respawn and collision-driven seamless round trip retain coating until a real underwater frame', async () => {
 try {
  // Death scatters the shotgun and respawn gives only the axe: the shotgun's blood stays the shotgun's, the axe is a
  // different, clean weapon, and the player's body coating carries through death, respawn and travel.
  const kept = () => JSON.stringify( [ weaponSurface.body, weaponSurface.state( 'progs/v_shot.mdl' ) ].map( s => ( { blood: s.blood, serial: s.serial, spots: s.spots.map( v => v.toArray() ) } ) ) );
  let player = await fresh('e1m2'); wetBlood(player); same( weaponKey(), 'progs/v_shot.mdl', 'native start holds the shotgun' ); const beforeCoat = kept();
  progs.pr_global_struct.self = progs.EDICT_TO_PROG(player); progs.pr_global_struct.time = sv.time;
  const die = ED_FindFunction('ClientKill'); check(die,'actual native death function present'); PR_ExecuteProgram(progs.pr_functions.indexOf(die));
  const sequence = player._respawn?.sequence; check(sequence,'native death enters enhanced respawn');
  for ( const time of [sequence.at+.22+sequence.turn/2+.001,sequence.at+.22+sequence.turn+.001] ) { sv.time=time; SV_SetFrametime(.001); SV_Physics_Client(player,1); frame(eye(player)); same(kept(),beforeCoat,'native respawn and actual dry renderer frame preserve the body and shotgun blood'); }
  same(player.v.health,100,'actual native respawn completed'); check(!player._respawn.sequence,'sequence released');
  same(weaponKey(),'progs/v_axe.mdl','respawn holds the axe'); same(weaponSurface.blood,0,'the respawn axe carries none of the shotgun\'s blood');
  for ( const destination of ['e1m3','e1m2'] ) {
   const crossing=travel.SV_SeamlessCrossings().find(c=>c.map===destination); check(crossing,'native passage exists '+destination);
   player.v.origin=crossing.transform.center.map((v,i)=>v-crossing.transform.through[i]*32); player.v.velocity=crossing.transform.through.map(v=>v*120); SV_LinkEdict(player,false); travel.SV_SeamlessFrame();
   for(let step=0;step<18&&!travel.SV_SeamlessPending();step++){sv.time+=.1;const trace=SV_PushEntity(player,crossing.transform.through.map(v=>v*4));check(!trace.startsolid,'native collision approach stays outside solids');travel.SV_SeamlessFrame();}
   same(travel.SV_SeamlessPending()?.map,destination,'actual movement queues transition'); acknowledge(); cmd.Cbuf_Execute(); await Promise.resolve(); player=finishConnect(); travel.SV_SeamlessHolding(1);sv.time+=5;
   frame(eye(player)); same(kept(),beforeCoat,'actual seamless host command and renderer arrival retain the body and shotgun blood'); same(sv.name,destination,'destination world actually loaded');
  }
  const wet = waterPoint(); frame(wet,sv.time+.1); same(weaponSurface.body.blood,0,'native water leaf finally washes the body\'s persistent blood'); check(weaponSurface.state('progs/v_shot.mdl').blood>0,'the scattered shotgun, not in hand, is not washed'); same(weaponSurface.blood,0,'the axe in hand is clean'); check(weaponSurface.spots.every(s=>s.w===0),'submersion clears all surface splats');
  frame(eye(player),sv.time+.2); same(weaponSurface.wet,1,'water exit starts short wet film'); frame(eye(player),sv.time+4.2); same(weaponSurface.wet,0,'wet shine dries over four game seconds');
  console.log('MODEL_SURFACE_NATIVE_TRAVEL '+JSON.stringify({map:sv.name,health:player.v.health,blood:weaponSurface.blood,wet:weaponSurface.wet,waterWitness:wet}));
 } finally { acknowledge(); CL_Disconnect_f(); travel.SV_SeamlessReset(); }
} );

Deno.test( 'UV contact seeds bounded clusters at the exact hit without overwriting older splats and preserves the three-argument context fallback', () => {
 const state = new WeaponSurfaceState(), contact = [.72,.28];
 check(state.add(.3,contact),'localized event admitted'); same(state.spots.filter(s=>s.w>0).length,3,'one contact seeds three clusters');
 near(state.spots[0].x,contact[0],'primary cluster exact contact U'); near(state.spots[0].y,contact[1],'primary cluster exact contact V');
 for(const spot of state.spots.filter(s=>s.w>0)){check(Math.abs(spot.x-contact[0])<=.04&&Math.abs(spot.y-contact[1])<=.04,'secondary clusters remain within contact neighbourhood');check(spot.z>=.055&&spot.z<=.15,'visible splat radius stays bounded');}
 const first=state.spots.slice(0,3).map(s=>s.toArray().join());state.add(.2,[.1,.9]);same(state.spots.slice(0,3).map(s=>s.toArray().join()).join('|'),first.join('|'),'later contact does not overwrite existing splats');
 for(let i=0;i<4;i++)state.add(.1,[.9,.1]);same(state.spots.length,12,'many contacts stay bounded');same(state.spots.slice(0,3).map(s=>[s.x,s.y].join()).join('|'),first.map(s=>s.split(',').slice(0,2).join()).join('|'),'saturation retains existing cluster positions');check(state.spots.every(s=>s.z<=.22&&s.w<=1),'saturated radii and opacity remain bounded');
 const saved=weaponSurface.snapshot(),last=weaponSurface.last;
 const oldModel=cl.viewent.model;cl.viewent.model={name:'progs/v_shot.mdl'};
 try{weaponSurface.restore(new WeaponSurfaceState().snapshot(),0);R_WeaponSurfaceContext(true,[0,0,0],()=>true);const expected=new WeaponSurfaceState();expected.add(.2);check(R_PlayerSurfaceBlood(11),'original three-argument context still accepts player blood');same(snapshot(),JSON.stringify(expected.snapshot()),'no contact callback retains original deterministic random placement');}
 finally{weaponSurface.restore(saved,last);R_WeaponSurfaceContext(false,null,null);cl.viewent.model=oldModel;}
} );

Deno.test( 'actual frame contact callback follows transformed and in-place posed triangles, rejects hidden meshes and BSP-occluded spray', async () => {
 const saved=weaponSurface.snapshot(),last=weaponSurface.last;let geometry,material,mesh,oldMesh;
 try{
  const player=await fresh(),air=eye(player);geometry=new THREE.PlaneGeometry(10,10);material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(air[0]+2,air[1]+3,air[2]-20);mesh.rotation.set(.2,.3,.4);mesh.scale.set(1.2,1.5,1.1);scene.add(mesh);oldMesh=cl.viewent._aliasMesh;cl.viewent._aliasMesh=mesh;
  const clean=()=>weaponSurface.restore(new WeaponSurfaceState().snapshot(),sv.time);
  clean();frame(air);check(R_PlayerSurfaceBlood(11),'actual renderer-owned contact callback accepts player transfer');near(weaponSurface.spots[0].x,.5,'actual transformed triangle center hit U');near(weaponSurface.spots[0].y,.5,'actual transformed triangle center hit V');
  check(geometry.boundingBox&&geometry.boundingSphere,'first ray caches original posed bounds');for(let i=0;i<geometry.attributes.position.count;i++)geometry.attributes.position.setX(i,geometry.attributes.position.getX(i)+40);geometry.attributes.position.needsUpdate=true;
  clean();frame(air);check(R_PlayerSurfaceBlood(11),'second event uses changed current pose');near(weaponSurface.spots[0].x,.5,'in-place posed triangle updates contact U despite old bounding box');near(weaponSurface.spots[0].y,.5,'in-place posed triangle updates contact V despite old bounding sphere');
  for(const hidden of ['detached','invisible','hidden ancestor']){
   if(hidden==='detached')scene.remove(mesh);else if(hidden==='invisible'){scene.add(mesh);mesh.visible=false;}else{mesh.visible=true;const group=new THREE.Group();group.visible=false;scene.add(group);group.add(mesh);}
   clean();frame(air);R_PlayerSurfaceBlood(11);const expected=new WeaponSurfaceState();expected.add(.2);same(snapshot(),JSON.stringify(expected.snapshot()),hidden+' uses safe player-surface fallback, never stale weapon UV');
   const parent=mesh.parent;if(parent&&parent!==scene){parent.remove(mesh);scene.remove(parent);}mesh.visible=true;
  }
  scene.add(mesh);clean();frame(air);
  let blocked=null;for(const distance of[8,16,32,48,64])for(const axis of[0,1,2])for(const sign of[-1,1]){const point=air.slice();point[axis]+=distance*sign;if(Mod_PointInLeaf(point,sv.worldmodel).contents===-2)blocked=point;}
  check(blocked&&Math.hypot(...blocked.map((v,i)=>v-air[i]))<72,'native BSP supplies a nearby occluded spray witness');check(!R_WeaponSurfaceBloodAt(blocked,30),'actual BSP visibility rejects occluded nearby blood');same(weaponSurface.blood,0,'occluded blood leaves coating untouched');
  check(R_WeaponSurfaceBloodAt(air,30),'visible native-air spray admitted');near(weaponSurface.spots[0].x,.5,'visible spray localizes to actual posed gun U');near(weaponSurface.spots[0].y,.5,'visible spray localizes to actual posed gun V');
  console.log('MODEL_SURFACE_CONTACT_NATIVE '+JSON.stringify({air,blocked,uv:weaponSurface.spots[0].toArray().slice(0,2),poseShift:40}));
 }finally{if(mesh?.parent)mesh.parent.remove(mesh);if(cl.viewent)cl.viewent._aliasMesh=oldMesh;geometry?.dispose();material?.dispose();weaponSurface.restore(saved,last);acknowledge();CL_Disconnect_f();R_WeaponSurfaceContext(false,null,null);}
} );
