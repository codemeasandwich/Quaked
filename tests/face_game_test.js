// (look names are the artwork's own, from the character's point of view: head_right/eyes_right look toward the screen's left)
// Actual network/parser and view adapter boundaries; native QC loss/cadence
// observations are separately exercised by face_native_test.
import {cl,cls} from '../src/client.js';
import {cl_simorg,cl_simangles} from '../src/cl_pred.js';
import {in_attack} from '../src/cl_input.js';
import * as common from '../src/engine/common/common.js';
import {net_message} from '../src/net.js';
import {V_ParseDamage} from '../src/view.js';
import {CL_ParseClientdata,CL_ParseServerMessage} from '../src/cl_parse.js';
import {R_PlayerFaceFrame,R_FaceShot} from '../src/r_facegame.js';
import * as q from '../src/engine/common/quakedef.js';
import {svc_foundsecret,svc_killedmonster} from '../src/engine/common/protocol.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
function fixture(fn){const saved={world:cl.worldmodel,time:cl.time,stats:cl.stats.slice(),items:cl.items,viewentity:cl.viewentity,signon:cls.signon,demo:cls.demoplayback,attack:in_attack.state,origin:cl_simorg.slice(),angles:cl_simangles.slice(),net:{...net_message},message:common.net_message};try{cl.worldmodel={faceFixture:true};cl.time=0;cl.stats.fill(0);cl.stats[q.STAT_HEALTH]=100;cl.items=0;cl.viewentity=0;cls.signon=4;cls.demoplayback=false;in_attack.state=0;cl_simorg.fill(0);cl_simangles.fill(0);common.SZ_Alloc(net_message,512);common.COM_SetNetMessage(net_message);R_PlayerFaceFrame();fn();}finally{cl.worldmodel=saved.world;cl.time=saved.time;cl.stats.set(saved.stats);cl.items=saved.items;cl.viewentity=saved.viewentity;cls.signon=saved.signon;cls.demoplayback=saved.demo;in_attack.state=saved.attack;cl_simorg.set(saved.origin);cl_simangles.set(saved.angles);Object.assign(net_message,saved.net);common.COM_SetNetMessage(saved.message);}}
function frame(time){cl.time=time;return R_PlayerFaceFrame();}
function damage(armor,blood,from){common.SZ_Clear(net_message);common.MSG_WriteByte(net_message,armor);common.MSG_WriteByte(net_message,blood);for(const v of from)common.MSG_WriteCoord(net_message,v);common.MSG_BeginReading();V_ParseDamage();check(!common.msg_badread,'real damage packet completely readable');}
function inventory(items,health=100,ammo=0){common.SZ_Clear(net_message);common.MSG_WriteLong(net_message,items);common.MSG_WriteShort(net_message,health);common.MSG_WriteByte(net_message,ammo);for(let i=0;i<4;i++)common.MSG_WriteByte(net_message,ammo);common.MSG_WriteByte(net_message,q.IT_SHOTGUN);common.MSG_BeginReading();CL_ParseClientdata(0);check(!common.msg_badread,'real native clientdata payload completely readable');}
function event(code){common.SZ_Clear(net_message);common.MSG_WriteByte(net_message,code);CL_ParseServerMessage();}
Deno.test('native damage packet uses impact-time predicted view orientation and immediate reaction, not later camera turns',()=>fixture(()=>{
 cl_simangles[1]=90;damage(0,5,[100,0,0]);same(frame(0).expression,'pain','actual view damage hook reacts in same frame');cl_simangles[1]=180;same(frame(.04).look,'eyes_left','impact yaw90 makes east attacker HUD-right');same(frame(.08).look,'head_left','camera turning after impact cannot reinterpret direction');
 cl.worldmodel={next:true};cl.time=0;cl_simangles[1]=0;R_PlayerFaceFrame();damage(0,5,[100,0,0]);frame(0);frame(.04);same(frame(.08).look,'front','same world source is front under impact yaw0');
 cl.worldmodel={unknown:true};cl.time=0;R_PlayerFaceFrame();damage(0,5,[0,0,0]);same(frame(0).expression,'pain','unknown damage still reacts');same(frame(.08).look,'front','coincident/fall-like source has no invented horizontal direction');
}));
Deno.test('actual clientdata and secret packets grin only for eligible post-signon pickups or discovery; ammo healing and routine kills do not',()=>fixture(()=>{
 cls.signon=3;inventory(q.IT_AXE|q.IT_SHOTGUN);same(frame(0).expression,'normal','initial spawn inventory is baseline');cls.signon=4;cl.time=.1;inventory(q.IT_AXE|q.IT_SHOTGUN,100,20);same(frame(.1).expression,'normal','ammo-only clientdata is not a pickup celebration');cl.time=.2;inventory(q.IT_AXE|q.IT_SHOTGUN,70,20);same(frame(.2).expression,'normal','raw health changes do not fabricate damage reactions');cl.time=.3;inventory(q.IT_AXE|q.IT_SHOTGUN,90,30);same(frame(.3).expression,'normal','healing and ammo gains do not grin');event(svc_killedmonster);same(frame(.3).expression,'normal','actual kill statistic packet does not grin');same(cl.stats[q.STAT_MONSTERS],1,'native kill statistic still updates');
 cl.time=.4;inventory(q.IT_AXE|q.IT_SHOTGUN|q.IT_NAILGUN,70,30);const pickup=frame(.4);same(pickup.expression,'mischievous_excited','actual new weapon bit grins');same(pickup.health,4,'injury layer continues during grin');same(frame(2.401).expression,'normal','pickup grin expires');cl.time=2.5;event(svc_foundsecret);same(frame(2.5).expression,'mischievous_excited','actual secret message grins');same(cl.stats[q.STAT_SECRETS],1,'native secret statistic still updates');
}));
Deno.test('adapter requires genuine shot evidence and isolates demo reactions from the continuing live face',()=>fixture(()=>{
 in_attack.state=1;for(let i=0;i<30;i++)check(frame(i*.1).expression!=='focused_determined','attack button alone never counts as actual firing');cl.worldmodel={shots:true};cl.time=3;R_PlayerFaceFrame();for(let i=0;i<=20;i++){cl.time=3+i*.1;R_FaceShot(.1);const face=R_PlayerFaceFrame();same(face.expression,i<20?'normal':'focused_determined','public actual-shot events sustain focus');}in_attack.state=0;frame(5.1);same(frame(5.401).expression,'normal','actual adapter releases focused tail');
 cl.worldmodel={liveDamage:true};cl.time=6;R_PlayerFaceFrame();damage(0,1,[0,100,0]);frame(6);frame(6.04);same(frame(6.08).look,'head_right','live reaction control');cls.demoplayback=true;cl.time=6.1;R_PlayerFaceFrame();damage(0,30,[0,-100,0]);same(frame(6.1).expression,'shocked','demo has its own immediate heavy reaction');cls.demoplayback=false;same(frame(6.11).look,'head_right','return from demo retains live direction');same(frame(6.11).expression,'pain','demo shock did not replace live expression');
}));
Deno.test('real clientdata death and respawn reset a hidden HUD before its next draw or damage event',()=>fixture(()=>{
 damage(0,1,[0,100,0]);frame(0);frame(.04);same(frame(.08).look,'head_right','live old-life pose established');cl.time=.1;inventory(0,0);cl.time=.2;inventory(0,100); // Deliberately no HUD/frame sampling between these packets.
 cl.time=.21;damage(0,1,[0,-100,0]);const resumed=frame(.21);same(resumed.look,'front','hidden respawn reset happens before new-life impact');same(resumed.expression,'pain','new-life damage is accepted immediately instead of ignored by stale death');same(frame(.25).look,'eyes_left','new-life first neighbor');same(frame(.29).look,'head_left','new-life opposite direction after hidden reset');same(frame(.411).expression,'normal','old-life timers cannot return after new pain ends');
}));
