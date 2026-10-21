import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
const O=dirname(fileURLToPath(import.meta.url)),R=resolve(O,'../../../../..');
// Read-only reuse of the installed exact package version; no node_modules edit/install/symlink.
const threeRoot='/Users/bri/SOURCE/Quaked/node_modules/three';
const threePackage=JSON.parse(readFileSync(resolve(threeRoot,'package.json'),'utf8'));
if(threePackage.version!=='0.183.0')throw Error('Dependency version differs');
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:pathToFileURL(resolve(threeRoot,'build/three.module.js')).href,shortCircuit:true}:next(specifier,context);}});
const sha=b=>createHash('sha256').update(b).digest('hex');
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const pak=await import(resolve(R,'src/engine/common/pak.js'));
const vid=await import(resolve(R,'src/engine/render/vid.js'));
const models=await import(resolve(R,'src/engine/render/gl_model.js'));
const skins=await import(resolve(R,'src/newer/render/r_newerskins.js'));
await import(resolve(R,'src/newer/install.js'));
const expected=JSON.parse(readFileSync(resolve(O,'native-intake.json'),'utf8'));
const checks=[];const check=(v,name,data={})=>{checks.push({pass:!!v,name,...data});if(!v)throw Error(name)};
for(const row of expected.mounts){const b=readFileSync(row.file);check(sha(b)===row.sha256,'actual PAK current hash '+row.file);pak.COM_AddPack(pak.COM_LoadPackFile(row.file,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)));}
const raw=pak.COM_FindFile('progs/ogre.mdl').data.slice(),palette=pak.COM_FindFile('gfx/palette.lmp').data.slice();
check(sha(raw)===expected.effectiveModel.sha256,'production PAK precedence resolves audited model');check(sha(palette)===expected.effectivePalette.sha256,'production PAK precedence resolves audited palette');
vid.VID_SetPalette(palette);models.Mod_Init();const m=models.Mod_ForName('progs/ogre.mdl',true),h=models.Mod_Extradata(m);await m.aliasSourceIdentity.promise;
check(m.aliasSourceIdentity.state==='ready'&&m.aliasSourceIdentity.sha256===sha(raw),'production model identity binds exact pre-floodfill source');
for(const [key,val]of Object.entries({numskins:1,skinwidth:264,skinheight:194,numverts:169,numtris:326,numframes:147,numposes:147}))check(h[key]===val,'production header '+key,{actual:h[key],expected:val});
const tex=h.gl_texturenum[0][0],rgba=tex.image.data;check(tex.image.width===264&&tex.image.height===194,'production native texture dimensions');
let alphaNonOpaque=0;for(let i=3;i<rgba.length;i+=4)alphaNonOpaque+=rgba[i]!==255;
check(alphaNonOpaque===0,'production skin opaque; alpha=false');
const index=JSON.parse(readFileSync(resolve(R,'assets/game/enemies/index.json'),'utf8'));const base=index.models.ogre.find(v=>v.dir==='ogre/custom'),rogue=index.models.ogre.find(v=>v.dir==='ogre/rogue1');
check(skins.R_NewerVariantMatchesModel(base,m),'existing unconstrained base variant matches actual original model');check(!skins.R_NewerVariantMatchesModel(rogue,m),'identity-bound Rogue skin1 rejects original model');
let rawRGBA=Buffer.alloc(264*194*4);for(let i=0;i<264*194;i++){const at=raw[88+i]*3;for(let c=0;c<3;c++)rawRGBA[i*4+c]=palette[at+c];rawRGBA[i*4+3]=255;}
let changed=0;for(let i=0;i<264*194;i++)if(rgba[i*4]!==rawRGBA[i*4]||rgba[i*4+1]!==rawRGBA[i*4+1]||rgba[i*4+2]!==rawRGBA[i*4+2])changed++;
const r={schemaVersion:1,observedAt:new Date().toISOString(),scope:'Actual public production PAK/model loader and variant identity predicates in Node CPU-only; no DOM, WebGL, build, asset fetch, browser or gameplay exercise.',dependency:{file:resolve(threeRoot,'build/three.module.js'),sha256:sha(readFileSync(resolve(threeRoot,'build/three.module.js'))),version:threePackage.version,method:'Read-only Node registerHooks maps bare three to installed exact version; no install/symlink.'},pass:checks.every(c=>c.pass),checks,sourceModelSHA256:sha(raw),aliasIdentity:m.aliasSourceIdentity.sha256,nativeRawRGBA_SHA256:sha(rawRGBA),productionUploadedRGBA_SHA256:sha(rgba),floodfillChangedPixels:changed,nativeTextureFlipY:tex.flipY,baseVariantIdentityConstraint:base.nativeModelSha256??null,rogueVariantIdentityConstraint:rogue.nativeModelSha256,limitation:'Unconstrained original Ogre variant matches other same-name models by design; this audit changes no manifest. Actual GPU/pose/material acceptance is separate.'};
writeFileSync(resolve(O,'public-loader-verification.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({pass:r.pass,checks:checks.length,identity:r.aliasIdentity,floodfillChangedPixels:changed}));
