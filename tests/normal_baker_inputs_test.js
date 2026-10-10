// Regression witnesses for the two concrete offline/runtime identity defects.
// Runs the actual baker image helper and initialization statements; no bake.
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import * as vid from '../src/engine/render/vid.js';
import * as model from '../src/engine/render/gl_model.js';
import * as pak from '../src/engine/common/pak.js';
import {NormalInputs,NormalInputWitness} from '../src/normal_prepare.js';
import {r_hdr} from '../src/gl_post.js';
import {Cvar_RegisterVariable,Cvar_FindVar,Cvar_SetValue,Cvar_Set} from '../src/engine/common/cvar.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),read=p=>readFileSync(new URL('../'+p,import.meta.url)),baker=read('tools/bake_normals.mjs').toString();
Deno.test('actual offline skin image helper waits for decoded pixels before reading canvas; removing await recreates the original empty input',async()=>{
 const begin=baker.indexOf('const image=async path=>'),end=baker.indexOf('const companion=',begin);check(begin>=0&&end>begin,'actual baker helper found');const code=baker.slice(begin,end);let decoded=false,decodeCalls=0,draws=0;
 class FileImage{set src(value){this.value=value;this.width=this.height=0;}async decode(){decodeCalls++;await Promise.resolve();this.width=3;this.height=2;decoded=true;}}
 const canvas={createCanvas(w,h){check(decoded,'canvas allocation must follow decode');same(w,3,'decoded width');same(h,2,'decoded height');return{getContext(){return{drawImage(image){check(decoded&&image.width===3,'actual decoded image drawn');draws++;},getImageData(){return{data:new Uint8ClampedArray(24).fill(73)};}};}};}};
 const extract=s=>new Script(s+'\nimage').runInNewContext({FileImage,canvas,spawnSync(){throw Error('Unrelated Ogre HEAD branch must not be used');}}),image=extract(code),pixels=await image('newer/enemies/zombie/custom/diffuse.webp');same(decodeCalls,1,'actual helper awaits one decode');same(draws,1,'actual helper draws after decode');same(pixels.data.length,24,'complete expected RGBA coverage');decoded=false;let error;try{await extract(code.replace('await img.decode();',''))('newer/enemies/zombie/custom/diffuse.webp');}catch(e){error=e;}check(error?.message.includes('follow decode'),'old no-await mutation is caught independently');
});

Deno.test('actual baker palette initialization matches runtime224 fullbright boundary and prevents old all-black native normal inputs',async()=>{
 const original=read('pak0.pak');pak.COM_AddPack(pak.COM_LoadPackFile('normal-baker-native-source',original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength)));const before=vid.vid.fullbright,oldHdr=r_hdr.string;if(!Cvar_FindVar(r_hdr.name))Cvar_RegisterVariable(r_hdr);Cvar_SetValue(r_hdr.name,0);
 const init=baker.match(/vid\.VID_SetPalette\([^;]+;vid\.vid\.fullbright=[^;]+;model\.Mod_Init\(\);/)?.[0],runtime=read('src/engine/render/vid.js').toString().match(/vid\.fullbright\s*=\s*[^;]+;/)?.[0];check(init&&runtime,'actual offline/runtime initialization statements found');const runtimeState={fullbright:0};new Script(runtime).runInNewContext({vid:runtimeState});
 try{vid.vid.fullbright=0;new Script(init).runInNewContext({vid,pak,model});same(vid.vid.fullbright,runtimeState.fullbright,'offline/native palette threshold agrees');same(vid.vid.fullbright,224,'only final32 palette indices are fullbright');const good=model.Mod_ForName('maps/e1m3.bsp',true),texture=good.textures.find(t=>t?.gl_texture&&!t.name.startsWith('*')&&!t.name.startsWith('sky')&&t.gl_texture.image.data.some((v,i)=>i%4!==3&&v>0));check(texture,'actual native pigment positive control');const name=texture.name,witness=await NormalInputWitness(NormalInputs(texture.gl_texture));
  model.Mod_ClearAll();vid.vid.fullbright=0;new Script(init.replace(/vid\.vid\.fullbright=[^;]+;/,'')).runInNewContext({vid,pak,model});const wrong=model.Mod_ForName('maps/e1m3.bsp',true).textures.find(t=>t?.name===name),old=await NormalInputWitness(NormalInputs(wrong.gl_texture));check(wrong.gl_texture.image.data.every((v,i)=>i%4===3||v===0),'old zero threshold blackens all native base pigment');check(old.rgba!==witness.rgba&&old.key!==witness.key,'actual old bug necessarily misses corrected runtime key');console.log('NORMAL_PALETTE_WITNESS '+JSON.stringify({texture:name,runtimeFullbright:runtimeState.fullbright,correctKey:witness.key,oldKey:old.key}));
 }finally{model.Mod_ClearAll();vid.vid.fullbright=before;Cvar_Set(r_hdr.name,oldHdr);}
});
