// Independent public-interface checks: real demo2 packets supply the player position,
// health and suit. No local-server air clock is substituted for recorded playback.
import assert from 'node:assert/strict';
import { readFileSync } from './helpers/resource_fs.mjs';
import { fileURLToPath } from 'node:url';
import { assetPath } from '../tools/distribution/manifest.mjs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { CL_Init, CL_RelinkEntities, CL_ClearState, CL_Disconnect_f } from '../src/engine/client/cl_main.js';
import { CL_PlayDemoFromData, CL_GetMessage } from '../src/engine/client/cl_demo.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { cl, cls, cl_entities, ca_connected } from '../src/engine/client/client.js';
import { R_Init, R_SetupFrame } from '../src/engine/render/gl_rmain.js';
import { V_Init, V_CalcRefdef } from '../src/engine/client/view.js';
import { NET_Init } from '../src/engine/net/net_main.js';
import { Cbuf_Init, Cmd_Init } from '../src/engine/common/cmd.js';
import { Cvar_SetValue } from '../src/engine/common/cvar.js';
import { R_DemoLoadingCancel } from '../src/newer/ui/r_demoloading.js';
import { CL_PlayerWater, CL_WaterReset } from '../src/newer/gameplay/cl_water.js';
import { R_PlayerFaceFrame, R_FaceWater, R_FaceHealthChanged } from '../src/newer/ui/r_facegame.js';
import { STAT_HEALTH, IT_SUIT } from '../src/engine/common/quakedef.js';

const root = fileURLToPath( new URL( '../', import.meta.url ) );
const bytes = readFileSync( assetPath( root, 'games/shareware/pak0.pak' ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'shareware.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); Cbuf_Init(); Cmd_Init(); CL_Init(); R_Init(); V_Init(); NET_Init(); Cvar_SetValue( 'r_hdr', 1 );

function fixture( z = -40 ) {
 CL_ClearState(); CL_WaterReset(); cls.state = ca_connected; cls.signon = 4; cls.demoplayback = true; cls.demofile = {}; cl.time = 10;
 cl.worldmodel = { name: 'water-observation-fixture', nodes: [ { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, children: [ { contents: -1 }, { contents: -3 } ] } ] };
 cl.viewentity = 1; cl.viewheight = 22; cl.onground = true; cl.stats[ STAT_HEALTH ] = 100; cl.items = 0; cl.velocity.fill( 0 ); cl_entities[ 1 ].origin.set( [ 0, 0, z ] );
 return cl_entities[ 1 ].origin;
}

Deno.test( 'real demo2 fills the HUD face from the rendered player view', () => {
 const data = pak.COM_FindFile( 'demo2.dem' )?.data; assert.ok( data, 'shareware contains demo2.dem' );
 const demo = data instanceof Uint8Array ? data : new Uint8Array( data );
 cls.demonum = -1; CL_PlayDemoFromData( demo.buffer.slice( demo.byteOffset, demo.byteOffset + demo.byteLength ), false ); cls.timedemo = false;
 let samples = 0, submerged = 0, maxStage = 0, maxPercent = 0;
 try {
  for ( let packet = 0; packet < 20000 && cls.demoplayback; packet++ ) {
   R_DemoLoadingCancel(); cl.time = cl.mtime[ 0 ] + 1;
   if ( CL_GetMessage() !== 1 ) break;
   try { CL_ParseServerMessage(); } catch ( error ) {
    // The native final svc_disconnect ends playback through Host_EndGame.
    if ( ! cls.demoplayback && String( error.message ).trim() === 'Host_EndGame: Server disconnected' ) break;
    throw error;
   }
   if ( ! cls.demoplayback || cls.signon !== 4 ) continue;
   cl.time = cl.mtime[ 0 ]; cl.oldtime = cl.time; CL_RelinkEntities();
   V_CalcRefdef(); R_SetupFrame();
   const observation = CL_PlayerWater( cl, { view: true } ), face = R_PlayerFaceFrame(); samples++;
   if ( observation.submerged && cl.stats[ STAT_HEALTH ] > 0 ) {
    submerged++; assert.ok( face.waterStage >= 1, 'recorded eye submersion immediately shows water' );
    assert.equal( observation.airKnown, false, 'recording cannot expose a native air deadline' );
    maxStage = Math.max( maxStage, face.waterStage ); maxPercent = Math.max( maxPercent, face.waterPercent );
   }
  }
  console.log( 'DEMO2_WATER_EVIDENCE', JSON.stringify( { samples, submerged, maxStage, maxPercent } ) );
  assert.ok( samples > 100, 'actual demo packets reached signed-on playback' );
  assert.ok( submerged > 10, 'actual demo2 includes sustained player submersion' );
  assert.ok( maxStage > 1 && maxPercent > 10, `face visibly fills during demo2: stage ${maxStage}, air use ${maxPercent}` );
 } finally { CL_Disconnect_f(); }
} );

Deno.test( 'demo visual air freezes on repeated reads and resets on surfacing, suit, rewind and file replacement', () => {
 const origin = fixture();
 let face = R_PlayerFaceFrame(); assert.equal( face.waterStage, 1 );
 cl.time += 6; face = R_PlayerFaceFrame(); assert.ok( Math.abs( face.waterPercent - 50 ) < .001 ); assert.equal( face.waterStage, 6 );
 for ( let i = 0; i < 20; i++ ) assert.equal( R_FaceWater().waterPercent, face.waterPercent, 'reading does not consume air' );
 cl.items |= IT_SUIT; cl.time += 1; assert.equal( R_FaceWater().waterPercent, 0, 'suit replenishes visual reserve' );
 cl.items &= ~IT_SUIT; cl.time += 3; assert.ok( R_FaceWater().waterPercent > 0 );
 origin[ 2 ] = 40; const drain = R_FaceWater().waterStage; assert.ok( drain > 0, 'surface starts the existing drain' );
 cl.time += .6; assert.equal( R_FaceWater().waterStage, 0, 'surface drains the overlay' );
 origin[ 2 ] = -40; assert.equal( R_FaceWater().waterPercent, 0, 'reentry gets fresh visual reserve' );
 cl.time += 8; assert.ok( R_FaceWater().waterPercent > 50 );
 cls.demofile = {}; cl.time += .1; assert.equal( R_FaceWater().waterStage, 1, 'new file cannot inherit old reserve' );
 cl.time += 7; R_FaceWater(); cl.time -= 6; assert.equal( R_FaceWater().waterStage, 1, 'rewind starts a new observation' );
 cl.stats[ STAT_HEALTH ] = 0; assert.equal( R_FaceWater().waterStage, 0, 'death clears water' );
 cl.stats[ STAT_HEALTH ] = 100; assert.equal( R_FaceWater().waterStage, 1, 'respawn starts clear reserve' );
 CL_ClearState(); assert.equal( R_FaceWater().waterStage, 0, 'client clear cannot borrow previous water' );
} );

Deno.test( 'client geometry distinguishes wading from head water and ignores stationary movement', () => {
 const origin = fixture( 10 );
 let value = CL_PlayerWater(); assert.equal( value.known, true ); assert.equal( value.submerged, false ); assert.equal( value.wading, false ); assert.equal( value.moving, false );
 cl.velocity[ 0 ] = 120; value = CL_PlayerWater(); assert.equal( value.moving, true ); assert.equal( value.wading, true );
 origin[ 2 ] = -40; value = CL_PlayerWater(); assert.equal( value.submerged, true ); assert.equal( value.wading, false, 'swimming is distinct from walking in shallow water' );
 origin[ 2 ] = 40; value = CL_PlayerWater(); assert.equal( value.water, false ); assert.equal( value.wading, false );
 cls.demoplayback = false; value = CL_PlayerWater(); assert.equal( value.airKnown, false, 'remote observation never invents authoritative air' );
} );

Deno.test( 'demo death and respawn received between visible frames discard the old fill', () => {
 fixture(); R_PlayerFaceFrame(); cl.time += 11; assert.equal( R_PlayerFaceFrame().waterStage, 10 );
 // Public parser health notifications may arrive in one host frame while HUD is hidden.
 cl.stats[ STAT_HEALTH ] = 0; R_FaceHealthChanged( 0 );
 cl.stats[ STAT_HEALTH ] = 100; R_FaceHealthChanged( 100 ); cl.time += .1;
 assert.equal( R_PlayerFaceFrame().waterStage, 1, 'fresh life cannot reuse the previous full visor' );
 assert.equal( R_FaceWater().waterPercent, 0, 'fresh life has a new visual reserve' );
} );
