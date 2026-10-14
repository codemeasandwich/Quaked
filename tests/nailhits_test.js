// Independent packet probe. Only Canvas2D and AudioContext are doubles; production packets, particles,
// (the surface's own sound beside a ricochet, quaked/hit_*, is the impacts effect's: its own test, material_impacts_test.js,
// checks the game's sounds and random draws are the same with it on or off, so this test leaves it out)
// BSP lookup, decal geometry, sound mixer/channels, cvars and mote layer are real. No implementation imports.
import * as THREE from 'three';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
const root=process.cwd();
const mod=path=>import(root+'/src/'+path);
const [tent,part,decals,motes,fx,vars,client,mode,glpost,pak,vid,common,model,dma,sound,cmd,places]=await Promise.all([
 mod('engine/client/cl_tent.js'),mod('engine/render/r_part.js'),mod('newer/render/r_decals.js'),mod('newer/render/r_motes.js'),mod('newer/render/fx_world.js'),mod('engine/common/cvar.js'),mod('engine/client/client.js'),mod('newer/mode.js'),mod('newer/render/gl_post.js'),mod('engine/common/pak.js'),mod('engine/render/vid.js'),mod('engine/common/common.js'),mod('engine/render/gl_model.js'),mod('engine/sound/snd_dma.js'),mod('engine/sound/sound.js'),mod('engine/common/cmd.js'),mod('newer/render/r_ambientplaces.js')]);
const check=(v,m)=>{if(!v)throw Error(m)},same=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m+': '+JSON.stringify(a)+' != '+JSON.stringify(b));
const scene=new THREE.Scene(),cl=client.cl;
const node=()=>({gain:{value:1},pan:{value:0},connect(){},disconnect(){},start(){},stop(){}});
class AudioContext{constructor(){this.destination={};this.sampleRate=44100;this.state='running';this.currentTime=0}createGain(){return node()}createStereoPanner(){return node()}createBuffer(ch,n){return{length:n,data:new Float32Array(n),getChannelData(){return this.data}}}createBufferSource(){return node()}resume(){return Promise.resolve()}close(){return Promise.resolve()}}
const noop=()=>{},ctx={createRadialGradient:()=>({addColorStop:noop}),beginPath:noop,arc:noop,fill:noop,moveTo:noop,lineTo:noop,stroke:noop};
globalThis.window={AudioContext};globalThis.document={createElement:()=>({getContext:()=>ctx})};
cmd.Cmd_Init();cmd.Cbuf_Init();for(const c of [glpost.r_hdr,decals.r_decals])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
const bytes=readFileSync(root+'/games/shareware/pak0.pak');pak.COM_AddPack(pak.COM_LoadPackFile('probe.pak',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));vid.VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);
(await mod('engine/render/gl_rmain.js')).R_Init();dma.S_Init();tent.CL_InitTEnts();part.R_InitParticles();part.R_SetParticleExternals({scene});
// x<0 is the wall; z<0 floor; z>=128 ceiling. Optional liquid below z64, open or solid above.
function level({liquid=0,capped=false,flags=0,missingSurface=false}={}){
 const wall={flags,plane:{normal:[1,0,0],type:0,dist:0},texinfo:{vecs:[[0,1,0,0],[0,0,1,0]],texture:{name:'metal1'}},texturemins:[-64,0],extents:[128,128]};
 const solid={contents:-2},air={contents:-1,firstmarksurface:missingSurface?[]:[wall],nummarksurfaces:missingSurface?0:1},water={...air,contents:liquid};
 const planes=[wall.plane,{normal:[0,0,1],type:2,dist:128},{normal:[0,0,1],type:2,dist:0},{normal:[0,0,1],type:2,dist:64}];
 const leaf=liquid?water:air;
 const nodes=[{contents:0,plane:planes[0],children:[{contents:0,plane:planes[1],children:[solid,{contents:0,plane:planes[2],children:[liquid?{contents:0,plane:planes[3],children:[capped?solid:air,water]}:air,solid]}]},solid]}];
 const clipnodes=[{planenum:0,children:[1,-2]},{planenum:1,children:[-2,2]},{planenum:2,children:[liquid?3:-1,-2]}];if(liquid)clipnodes.push({planenum:3,children:[capped?-2:-1,liquid]});
 return {nodes,leafs:[solid,air,leaf],hulls:[{planes,clipnodes,firstclipnode:0,lastclipnode:clipnodes.length-1}],entities:''};
}
const nativeGeometry=()=>{const p=scene.children.find(x=>x.isPoints&&!x.userData.newerOnly&&!x.userData.classicOnly);check(p,'native particle layer exists');const n=p.geometry.drawRange.count;return{count:n,pos:Array.from(p.geometry.attributes.position.array.slice(0,n*3)),color:Array.from(p.geometry.attributes.color.array.slice(0,n*3))}};
const decalGeometry=()=>{const m=scene.getObjectByName('quake_decals');return{count:decals.R_DecalCount(),pos:m?Array.from(m.geometry.attributes.position.array.slice(0,12)):[],uv:m?Array.from(m.geometry.attributes.uv.array.slice(0,8)):[]}};
function setup(opts={}){vars.Cvar_Set('r_hdr',opts.classic?'0':'1');vars.Cvar_Set('r_decals','1');if(vars.Cvar_FindVar('r_nailhits'))vars.Cvar_Set('r_nailhits',opts.off?'0':'1');mode.R_AnimSetClassicPass(false);cl.worldmodel=level(opts);cl.time=100;cl.oldtime=100;cl.viewentity=1;cl.paused=false;cl.intermission=0;cl.stats[0]=100;client.cls.state=client.ca_connected;client.cls.signon=client.SIGNONS;client.cls.demoplayback=false;part.R_ClearParticles();decals.R_DecalsClear();motes.R_MotesClear();places.R_AmbientPlacesClear();fx.FX_Seed(71);dma.S_StopAllSounds(true);decals.R_DecalsSetup({scene,cl:()=>cl,pointInLeaf:model.Mod_PointInLeaf,lightPoint:()=>128});}
function packet(type,pos){const data=new Uint8Array(7),v=new DataView(data.buffer);data[0]=type;pos.forEach((n,i)=>v.setInt16(1+i*2,n*8,true));common.COM_SetNetMessage({data,cursize:7,maxsize:7});common.MSG_BeginReading();tent.CL_ParseTEnt();}
function run(type=0,opts={},pos=[0.5,0,32]){setup(opts);let rng=0,state=opts.seed??191;const old=Math.random;Math.random=()=>{rng++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};try{packet(type,pos);const eventRng=rng;part.R_DrawParticles();decals.R_DecalsFrame();motes.R_MotesFrame(scene,100,pos);const native=nativeGeometry(),decal=decalGeometry(),sounds=sound.channels.filter(c=>c.sfx&&!c.sfx.name.startsWith('quaked/')).map(c=>({name:c.sfx.name,origin:[...c.origin],volume:c.master_vol,attenuation:c.dist_mult}));return{native,decal,sounds,rng:eventRng,motes:motes.R_MotesSnapshot()};}finally{Math.random=old}}
// Warm one-time Three.js mesh/texture UUID allocation before comparing the native event RNG.
run(0,{off:true});
Deno.test('both native nail packet outputs remain exact with additions enabled or off',()=>{for(const type of [0,1]){const off=run(type,{off:true}),on=run(type);same(on.native.count,type===0?10:20,'legacy particle count');same(on.native,off.native,'native geometry');same(on.decal,off.decal,'decal geometry');same(on.decal.count,1,'existing hole retained');same(on.sounds,off.sounds,'sound selection and channel parameters');same(on.sounds.length,1,'legacy sound actually played');same(on.rng,off.rng,'global random sequence unchanged');}});
Deno.test('both nail packets add dry sparks and a puff only while enabled',()=>{for(const type of [0,1]){const off=run(type,{off:true}),on=run(type);check(on.motes.motes.some(x=>x.kind==='spark')&&on.motes.motes.some(x=>x.kind==='puff'),'new dry impact has sparks AND puff');same(off.motes.count,0,'off adds nothing');}});
Deno.test('Classic, open air, sky, missing surface and deep solid never acquire dry nail additions',()=>{for(const [opts,pos] of [[{classic:true},[0.5,0,32]],[{},[40,0,32]],[{flags:4},[0.5,0,32]],[{missingSurface:true},[0.5,0,32]],[{},[-8,0,32]]])same(run(0,opts,pos).motes.count,0,'reject '+JSON.stringify({opts,pos}));});
Deno.test('water/slime nail packets make vertical bubbles below a proved open surface; lava and capped pools skip',()=>{for(const liquid of [-3,-4]){const x=run(0,{liquid},[24,0,32]);check(x.motes.count>0,'submerged nail produces bubbles');check(x.motes.motes.every(m=>m.kind==='bubble'&&m.pos[2]<64),'only bubbles below surface');const before=x.motes.motes.map(m=>m.pos);cl.time=100.1;motes.R_MotesFrame(scene,cl.time,[24,0,32]);const after=motes.R_MotesSnapshot().motes;check(after.length>0,'bubbles survive first advance');after.forEach((m,i)=>{check(m.pos[2]>before[i][2]&&m.pos[2]<64,'bubble rises under surface');check(Math.abs(m.pos[0]-before[i][0])<1e-5&&Math.abs(m.pos[1]-before[i][1])<1e-5,'bubble remains vertical')});same(run(0,{liquid,capped:true},[24,0,32]).motes.count,0,'solid cap refuses bubbles');}same(run(0,{liquid:-5},[24,0,32]).motes.count,0,'lava has no bubbles');});
Deno.test('nail packet flood preserves reserved drips and sparks and bounds its own admitted additions',()=>{setup();for(const owner of ['drips','sparks'])for(let i=0;i<128;i++)check(motes.R_MoteSpawn(owner==='drips'?motes.MOTE_DRIP:motes.MOTE_SPARK,50,i,100,0,0,0,100,{owner,life:5})>=0,'fill '+owner);for(let i=0;i<80;i++)packet(1,[0.5,0,32]);motes.R_MotesFrame(scene,100,[0.5,0,32]);const a=motes.R_MotesSnapshot();same(a.motes.filter(m=>m.pos[0]===50&&m.pos[2]===100).length,256,'all existing owner motes retained');check(a.count>256&&a.count<=384,'nails added within128 reserved slots');});

Deno.test('network-rounded dry contacts recover just inside the wall, stay outward, and do not need decals enabled',()=>{
 for(const x of [-.125,0,.125]){const a=run(0,{},[x,0,32]);check(a.motes.count>0,'quantized wall contact '+x+' recovers');check(a.motes.motes.every(m=>fx.FX_Contents(cl.worldmodel,m.pos)===fx.FX_EMPTY),'all motes start outside solid');}
 setup();vars.Cvar_Set('r_decals','0');packet(0,[.5,0,32]);motes.R_MotesFrame(scene,100,[.5,0,32]);check(motes.R_MotesSnapshot().count>0,'nail effect does not depend on decal setting');same(decals.R_DecalCount(),0,'decal setting still respected');
 vars.Cvar_Set('r_nailhits','0');motes.R_MotesFrame(scene,100,[.5,0,32]);same(motes.R_MotesSnapshot().count,0,'turning effect off while paused clears its own particles');
});
Deno.test('dry wall motes never travel through the solid wall',()=>{
 const first=run(1);check(first.motes.count>0,'supernail starts');let observed=0;
 for(let i=1;i<=20;i++){cl.time=100+i*.02;motes.R_MotesFrame(scene,cl.time,[.5,0,32]);for(const m of motes.R_MotesSnapshot().motes){observed++;check(fx.FX_Contents(cl.worldmodel,m.pos)===fx.FX_EMPTY,'visible mote never enters world solid')}}
 check(observed>0,'actually observed moving motes');
});

Deno.test('all native tink and ricochet branches keep identical audio choice and RNG consumption',()=>{
 const seen=new Set();for(let seed=1;seed<=64;seed++){const off=run(0,{off:true,seed}),on=run(0,{seed});same(on.sounds,off.sounds,'native sound seed '+seed);same(on.rng,off.rng,'native random calls seed '+seed);for(const sound of on.sounds)seen.add(sound.name);}
 for(const name of ['tink1','ric1','ric2','ric3'])check(seen.has('weapons/'+name+'.wav'),'actually exercised '+name);
});

Deno.test('ambiguous corners and exhausted liquid boundary walks fail closed',()=>{
 setup();const air=cl.worldmodel.leafs[1];const other={...air.firstmarksurface[0],plane:{normal:[0,1,0],type:1,dist:0},texinfo:{vecs:[[1,0,0,0],[0,0,1,0]]}};air.firstmarksurface.push(other);air.nummarksurfaces=2;packet(0,[.125,.125,32]);motes.R_MotesFrame(scene,100,[.125,.125,32]);same(motes.R_MotesSnapshot().count,0,'two plausible surface normals are refused');
 setup({liquid:-3});const planes=Array.from({length:3000},(_,i)=>({normal:[0,0,1],type:2,dist:32.1+i*.1}));const clipnodes=planes.map((_,i)=>({planenum:i,children:[i===planes.length-1?-1:i+1,-3]}));cl.worldmodel.hulls[0]={planes,clipnodes,firstclipnode:0,lastclipnode:clipnodes.length-1};packet(0,[24,0,32]);motes.R_MotesFrame(scene,100,[24,0,32]);same(motes.R_MotesSnapshot().count,0,'no bubble when boundary walk exceeds4096 visits');
});
