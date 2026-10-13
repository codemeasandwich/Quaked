import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PackClassifier,WEB_DATA_FILES,WebDataFile} from '../tools/distribution/packs.mjs';
import {VerifySite} from '../tools/distribution/verify-site.mjs';
test('the web build ships the core and shareware packs and the shareware PAK; other games stay out of it',async()=>{
 const classify=await PackClassifier();
 const cases={'newer/textures/adoor01_2.webp':'shareware','newer/enemies/dog/custom/diffuse.png':'shareware','newer/displacement/shareware/e1m3.dm.gz':'shareware','newer/displacement/newer/start.dm.gz':'shareware',
  'newer/bestiary/cover.png':'core','music/ambient.mp3':'core','newer/hud/index.json':'core','newer/displacement/rogue/r1m1.dm.gz':'rogue','newer/displacement/id1/e2m1.dm.gz':'quake'};
 for(const [path,pack] of Object.entries(cases))assert.equal(WebDataFile(path,classify),pack,path);
 assert.equal(WebDataFile('games/shareware/pak0.pak',classify),'pak0');
 assert.deepEqual(WEB_DATA_FILES,['core','shareware','pak0']);
});
test('a site is published only with exactly the data files its HTML names, byte for byte',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'quaked-site-test-'));
 try{
  const body=Buffer.from('category bytes'),file='data/images-0123456789abcdef.bin';
  const pack={parts:[{file,bytes:body.length,integrity:'sha256-'+createHash('sha256').update(body).digest('base64')}],bytes:body.length,rawBytes:body.length,gzip:false};
  await mkdir(join(dir,'data'));await writeFile(join(dir,file),body);
  await writeFile(join(dir,'index.html'),`<html><script id="quaked-assets" type="application/json">${JSON.stringify({profile:'web',files:{},packs:{images:pack}})}</script></html>`);
  assert.deepEqual(await VerifySite(dir),{files:1,bytes:body.length});
  const tampered=Buffer.from(body);tampered[0]^=1;await writeFile(join(dir,file),tampered);
  await assert.rejects(VerifySite(dir),/integrity/);
  await writeFile(join(dir,file),body);await writeFile(join(dir,'data/stale-ffffffffffffffff.bin'),'old');
  await assert.rejects(VerifySite(dir),/Unreferenced data files: data\/stale/);
  await rm(join(dir,'data/stale-ffffffffffffffff.bin'));await rm(join(dir,file));
  await assert.rejects(VerifySite(dir),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('the verifier runs when reached through a symlink, so a CI path can never make it skip',async()=>{
 const {execFileSync}=await import('node:child_process'),{symlink}=await import('node:fs/promises');
 const dir=await mkdtemp(join(tmpdir(),'quaked-site link-'));
 try{
  await symlink(join(process.cwd(),'tools/distribution'),join(dir,'tools'));
  assert.throws(()=>execFileSync(process.execPath,[join(dir,'tools/verify-site.mjs'),join(dir,'missing site')],{stdio:'pipe'}),/ENOENT|no such file/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
